import { z } from 'zod';

/** Accepts 0803…, 803…, 234803… or +234803… and returns the international form (+234…). */
export function normalizeNigerianPhone(input: string): string {
  const d = input.replace(/[^\d+]/g, '');
  if (d.startsWith('+234')) return d;
  if (d.startsWith('234')) return `+${d}`;
  if (d.startsWith('0')) return `+234${d.slice(1)}`;
  return `+234${d}`;
}

export const nigerianPhone = z
  .string()
  .trim()
  .transform(normalizeNigerianPhone)
  .pipe(z.string().regex(/^\+234[789][01]\d{8}$/, 'Enter a valid Nigerian phone number'));

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');

export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include a letter')
  .regex(/\d/, 'Include a number');

export const signInSchema = z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password') });

export const signUpSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name'),
    email: emailSchema,
    phone: nigerianPhone,
    password: passwordSchema,
    confirmPassword: z.string(),
    acceptTerms: z.literal(true, { error: 'Accept the terms to continue' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const deliveryAddressSchema = z.object({
  state: z.string().trim().min(2, 'Select a state'),
  city: z.string().trim().min(2, 'Enter a city'),
  address: z.string().trim().min(5, 'Enter the delivery address'),
  landmark: z.string().trim().min(2, 'Enter a nearby landmark'),
  phone: nigerianPhone,
});

export const checkoutSchema = z.discriminatedUnion('fulfilment', [
  z.object({
    fulfilment: z.literal('delivery'),
    branchId: z.string().uuid(),
    address: deliveryAddressSchema,
    couponCode: z.string().trim().optional(),
  }),
  z.object({
    fulfilment: z.literal('pickup'),
    branchId: z.string().uuid(),
    couponCode: z.string().trim().optional(),
  }),
]);

export const bookingRequestSchema = z.object({
  serviceId: z.string().uuid(),
  branchId: z.string().uuid(),
  staffId: z.string().uuid().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  paymentOption: z.enum(['full', 'advance']),
});

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional(),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
