import { z } from "zod";

const nicknameRe = /^[가-힣a-zA-Z0-9_]+$/;

export const profileUpdateSchema = z.object({
  nickname: z
    .string()
    .min(2, { message: "닉네임은 2자 이상이어야 합니다" })
    .max(16, { message: "닉네임은 16자 이하여야 합니다" })
    .regex(nicknameRe, { message: "한글, 영문, 숫자, 밑줄(_)만 사용 가능합니다" })
    .optional(),
  bio: z.string().max(500).nullable().optional(),
  target_round: z
    .number()
    .int()
    .min(1)
    .max(200)
    .nullable()
    .optional(),
  university: z.string().max(50).nullable().optional(),
  target_round_visible: z.boolean().optional(),
  university_visible: z.boolean().optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;
