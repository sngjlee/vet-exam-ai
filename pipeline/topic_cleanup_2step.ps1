param(
    [string]$Python = ".\.venv\Scripts\python.exe",
    [string]$Model = "claude-sonnet-4-6",
    [int]$BatchSize = 50,
    [string]$InventoryPath = "output\topic-cleanup-inventory.json",
    [string]$AliasPath = "output\topic-alias-suggestions-all.json",
    [string[]]$AliasConfidence = @("high"),
    [switch]$PreviewBackfill,
    [switch]$ApplyBackfill,
    [switch]$StopOnBackfillFailure,
    [switch]$SuggestAliases,
    [switch]$ApplyAliases
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path $Python)) {
    throw "Python executable not found: $Python"
}

Write-Host "[inventory] fetching active topic inventory..."
& $Python .\suggest_topic_aliases.py --inventory-output $InventoryPath --no-ai
if ($LASTEXITCODE -ne 0) {
    throw "inventory step failed"
}

$inventory = Get-Content -Raw -Encoding UTF8 $InventoryPath | ConvertFrom-Json
$categories = @($inventory.PSObject.Properties)
Write-Host "[inventory] categories=$($categories.Count)"

if ($PreviewBackfill -or $ApplyBackfill) {
    $failedBatches = @()
    foreach ($property in $categories) {
        $category = $property.Name
        $topics = @($property.Value)
        $rowCount = 0
        foreach ($topic in $topics) {
            $rowCount += [int]$topic.count
        }

        if ($rowCount -le 0) {
            continue
        }

        Write-Host "[backfill] category=$category active_rows=$rowCount"
        for ($offset = 0; $offset -lt $rowCount; $offset += $BatchSize) {
            $mode = if ($ApplyBackfill) { "--apply" } else { "--dry-run" }
            Write-Host "  [batch] offset=$offset limit=$BatchSize mode=$mode"
            & $Python .\backfill_topics.py `
                --generate-missing $mode `
                --category $category `
                --force `
                --active-only `
                --allow-failures `
                --model $Model `
                --limit $BatchSize `
                --offset $offset
            if ($LASTEXITCODE -ne 0) {
                $failedBatches += "category=$category offset=$offset exit=$LASTEXITCODE"
                Write-Warning "backfill batch failed: category=$category offset=$offset exit=$LASTEXITCODE"
                if ($StopOnBackfillFailure) {
                    throw "backfill failed for category=$category offset=$offset"
                }
            }

            if (-not $ApplyBackfill) {
                Write-Host "  [dry-run] stopping after first batch for this category. Add -ApplyBackfill to update all batches."
                break
            }
        }
    }
    if ($failedBatches.Count -gt 0) {
        Write-Warning "[backfill] failed batches: $($failedBatches -join '; ')"
    }
} else {
    Write-Host "[backfill] skipped. Use -PreviewBackfill or -ApplyBackfill."
}

if ($SuggestAliases) {
    Write-Host "[aliases] asking AI for alias suggestions from topic strings only..."
    & $Python .\suggest_topic_aliases.py --model $Model --output $AliasPath
    if ($LASTEXITCODE -ne 0) {
        throw "alias suggestion step failed"
    }

    $normalizeArgs = @(".\normalize_topics.py", "--alias-file", $AliasPath, "--dry-run")
    foreach ($confidence in $AliasConfidence) {
        $normalizeArgs += @("--confidence", $confidence)
    }
    Write-Host "[aliases] dry-run normalize..."
    & $Python @normalizeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "alias normalize dry-run failed"
    }
}

if ($ApplyAliases) {
    $normalizeArgs = @(".\normalize_topics.py", "--alias-file", $AliasPath, "--apply")
    foreach ($confidence in $AliasConfidence) {
        $normalizeArgs += @("--confidence", $confidence)
    }
    Write-Host "[aliases] applying normalize..."
    & $Python @normalizeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "alias normalize apply failed"
    }
}

Write-Host "[done] topic cleanup workflow complete"
