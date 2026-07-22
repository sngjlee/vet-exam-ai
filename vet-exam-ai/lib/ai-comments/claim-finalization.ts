import type {
  AiCommentClaimFailureCode,
  AiCommentFailureUpdate,
  AiCommentGenerationStore,
} from "./generate";

class AiCommentFailureFinalizationError extends Error {
  readonly name = "AiCommentFailureFinalizationError";

  constructor(
    readonly failureCode: AiCommentClaimFailureCode,
    readonly originalError: unknown,
    finalizationError: unknown,
  ) {
    super(`Failed to finalize AI comment claim as ${failureCode}`, { cause: finalizationError });
  }
}

async function failClaimAndRethrow(
  store: Pick<AiCommentGenerationStore, "markFailed">,
  update: AiCommentFailureUpdate,
  originalError: unknown,
): Promise<never> {
  try {
    await store.markFailed(update);
  } catch (finalizationError) {
    throw new AiCommentFailureFinalizationError(
      update.failureCode,
      originalError,
      finalizationError,
    );
  }
  throw originalError;
}

export async function runClaimOperation<Result>(
  operation: () => Promise<Result>,
  store: Pick<AiCommentGenerationStore, "markFailed">,
  failure: AiCommentFailureUpdate,
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    return failClaimAndRethrow(store, failure, error);
  }
}