import { z } from 'zod';

import { fetchJson } from '../http/fetch-json.js';

const AfterShipMetaSchema = z.object({
  code: z.number().int(),
});

const AfterShipCheckpointSchema = z.object({
  checkpoint_time: z.string().min(1).optional(),
  message: z.string().min(1).optional(),
  tag: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  country_iso3: z.string().min(1).optional(),
});

const AfterShipTrackingSchema = z.object({
  id: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  tracking_number: z.string().min(1),
  tag: z.string().min(1).optional(),
  delivered_at: z.string().min(1).optional(),
  last_checkpoint: z
    .object({
      checkpoint_time: z.string().min(1).optional(),
      message: z.string().min(1).optional(),
      tag: z.string().min(1).optional(),
      location: z.string().min(1).optional(),
      country_iso3: z.string().min(1).optional(),
    })
    .optional(),
  checkpoints: z.array(AfterShipCheckpointSchema).optional(),
});

const CreateTrackingResponseSchema = z.object({
  meta: AfterShipMetaSchema,
  data: z.object({
    tracking: AfterShipTrackingSchema,
  }),
});

const GetTrackingResponseSchema = z.object({
  meta: AfterShipMetaSchema,
  data: z.object({
    tracking: AfterShipTrackingSchema,
  }),
});

export type AfterShipTracking = z.infer<typeof AfterShipTrackingSchema>;

export type AfterShipClient = {
  createTracking: (input: {
    trackingNumber: string;
    carrierSlug?: string;
    orderId?: string;
    title?: string;
  }) => Promise<AfterShipTracking>;
  getTracking: (input: { trackingNumber: string; carrierSlug: string }) => Promise<AfterShipTracking>;
};

export function createAfterShipClient(apiKey: string): AfterShipClient {
  const baseUrl = 'https://api.aftership.com/v4';

  return {
    async createTracking(input) {
      const response = await fetchJson<unknown>(`${baseUrl}/trackings`, {
        method: 'POST',
        headers: {
          'aftership-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tracking: {
            tracking_number: input.trackingNumber,
            ...(input.carrierSlug ? { slug: input.carrierSlug } : {}),
            ...(input.orderId ? { order_id: input.orderId } : {}),
            ...(input.title ? { title: input.title } : {}),
          },
        }),
      });

      const parsed = CreateTrackingResponseSchema.parse(response.data);
      return parsed.data.tracking;
    },

    async getTracking(input) {
      const url = `${baseUrl}/trackings/${encodeURIComponent(input.carrierSlug)}/${encodeURIComponent(input.trackingNumber)}`;
      const response = await fetchJson<unknown>(url, {
        headers: {
          'aftership-api-key': apiKey,
        },
      });

      const parsed = GetTrackingResponseSchema.parse(response.data);
      return parsed.data.tracking;
    },
  };
}

export function getTrackingLastCheckpoint(tracking: AfterShipTracking): {
  checkpointAt: Date | null;
  summary: string | null;
  tag: string | null;
  deliveredAt: Date | null;
} {
  const deliveredAt = tracking.delivered_at ? new Date(tracking.delivered_at) : null;
  const tag = tracking.tag ?? tracking.last_checkpoint?.tag ?? null;

  const candidateCheckpointTime =
    tracking.last_checkpoint?.checkpoint_time ??
    tracking.checkpoints?.[tracking.checkpoints.length - 1]?.checkpoint_time ??
    null;

  const checkpointAt = candidateCheckpointTime ? new Date(candidateCheckpointTime) : null;

  const message =
    tracking.last_checkpoint?.message ?? tracking.checkpoints?.[tracking.checkpoints.length - 1]?.message ?? null;

  const location =
    tracking.last_checkpoint?.location ?? tracking.checkpoints?.[tracking.checkpoints.length - 1]?.location ?? null;

  const summaryParts = [message, location].filter((part) => part && part.trim().length);
  const summary = summaryParts.length ? summaryParts.join(' • ') : null;

  return {
    checkpointAt,
    summary,
    tag,
    deliveredAt: deliveredAt && !Number.isNaN(deliveredAt.getTime()) ? deliveredAt : null,
  };
}

export function isDelayTag(tag: string | null): boolean {
  if (!tag) return false;
  const normalized = tag.toLowerCase();
  return (
    normalized.includes('exception') ||
    normalized.includes('failed') ||
    normalized.includes('expired') ||
    normalized.includes('delay') ||
    normalized.includes('alert')
  );
}

