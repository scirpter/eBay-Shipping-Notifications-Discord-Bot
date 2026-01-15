import { z } from 'zod';

import { fetchJson } from '../http/fetch-json.js';

// 17TRACK Tracking API v2.4
// - Auth header: `17token`
// - Base URL: https://api.17track.net/track/v2.4
// Docs: https://api.17track.net/en/doc?version=v2.4

const SeventeenTrackRegisterAcceptedSchema = z.object({
  number: z.string().min(1),
  carrier: z.number().int(),
  origin: z.number().int().optional(),
});

const SeventeenTrackRegisterRejectedSchema = z.object({
  number: z.string().min(1),
  error: z.object({
    code: z.number().int(),
    message: z.string().min(1),
  }),
});

const SeventeenTrackRegisterResponseSchema = z.object({
  code: z.number().int(),
  data: z.object({
    accepted: z.array(SeventeenTrackRegisterAcceptedSchema),
    rejected: z.array(SeventeenTrackRegisterRejectedSchema),
  }),
});

const SeventeenTrackEventSchema = z
  .object({
    time_iso: z.string().min(1).nullable().optional(),
    time_utc: z.string().min(1).nullable().optional(),
    description: z.string().min(1).nullable().optional(),
    location: z.string().min(1).nullable().optional(),
    stage: z.string().min(1).nullable().optional(),
    sub_status: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const SeventeenTrackProviderSchema = z
  .object({
    provider: z
      .object({
        key: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    events: z.array(SeventeenTrackEventSchema).optional(),
  })
  .passthrough();

const SeventeenTrackTrackingSchema = z
  .object({
    providers: z.array(SeventeenTrackProviderSchema).optional(),
  })
  .passthrough();

const SeventeenTrackLatestStatusSchema = z
  .object({
    status: z.string().min(1).nullable().optional(),
    sub_status: z.string().min(1).nullable().optional(),
    sub_status_descr: z.string().min(1).nullable().optional(),
  })
  .passthrough();

const SeventeenTrackTrackInfoSchema = z
  .object({
    latest_status: SeventeenTrackLatestStatusSchema.optional(),
    latest_event: SeventeenTrackEventSchema.optional(),
    tracking: SeventeenTrackTrackingSchema.optional(),
  })
  .passthrough();

const SeventeenTrackGetTrackInfoAcceptedSchema = z
  .object({
    number: z.string().min(1),
    carrier: z.number().int(),
    track_info: SeventeenTrackTrackInfoSchema.optional(),
  })
  .passthrough();

const SeventeenTrackGetTrackInfoRejectedSchema = z.object({
  number: z.string().min(1),
  carrier: z.number().int().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string().min(1),
  }),
});

const SeventeenTrackGetTrackInfoResponseSchema = z.object({
  code: z.number().int(),
  data: z.object({
    accepted: z.array(SeventeenTrackGetTrackInfoAcceptedSchema),
    rejected: z.array(SeventeenTrackGetTrackInfoRejectedSchema),
  }),
});

export type SeventeenTrackEvent = z.infer<typeof SeventeenTrackEventSchema>;
export type SeventeenTrackTrackInfo = z.infer<typeof SeventeenTrackTrackInfoSchema>;

export type SeventeenTrackClient = {
  registerTracking: (input: { trackingNumber: string }) => Promise<{ carrier: number | null }>;
  getTracking: (input: { trackingNumber: string; carrier: number }) => Promise<SeventeenTrackTrackInfo>;
};

export function createSeventeenTrackClient(token: string): SeventeenTrackClient {
  const baseUrl = 'https://api.17track.net/track/v2.4';

  return {
    async registerTracking(input) {
      const response = await fetchJson<unknown>(`${baseUrl}/register`, {
        method: 'POST',
        headers: {
          '17token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ number: input.trackingNumber }]),
      });

      const parsed = SeventeenTrackRegisterResponseSchema.parse(response.data);
      const accepted = parsed.data.accepted.find((item) => item.number === input.trackingNumber) ?? null;
      return { carrier: accepted?.carrier ?? null };
    },

    async getTracking(input) {
      const response = await fetchJson<unknown>(`${baseUrl}/gettrackinfo`, {
        method: 'POST',
        headers: {
          '17token': token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ number: input.trackingNumber, carrier: input.carrier }]),
      });

      const parsed = SeventeenTrackGetTrackInfoResponseSchema.parse(response.data);
      const accepted = parsed.data.accepted.find((item) => item.number === input.trackingNumber) ?? null;

      if (!accepted?.track_info) {
        throw new Error(
          `17TRACK: no track_info for number=${input.trackingNumber} carrier=${input.carrier} (code=${parsed.code})`,
        );
      }

      return accepted.track_info;
    },
  };
}

function toValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAllEvents(trackInfo: SeventeenTrackTrackInfo): SeventeenTrackEvent[] {
  const providers = trackInfo.tracking?.providers ?? [];
  const events: SeventeenTrackEvent[] = [];
  for (const provider of providers) {
    if (!provider.events?.length) continue;
    events.push(...provider.events);
  }
  return events;
}

export function getTrackingLastCheckpoint(trackInfo: SeventeenTrackTrackInfo): {
  checkpointAt: Date | null;
  summary: string | null;
  tag: string | null;
  deliveredAt: Date | null;
} {
  const events = getAllEvents(trackInfo);

  let bestEvent: SeventeenTrackEvent | null = null;
  let bestEventAt: Date | null = null;
  for (const event of events) {
    const date = toValidDate(event.time_utc ?? event.time_iso);
    if (!date) continue;
    if (!bestEventAt || date.getTime() > bestEventAt.getTime()) {
      bestEventAt = date;
      bestEvent = event;
    }
  }

  const checkpointAt = bestEventAt;

  const message = bestEvent?.description ?? null;
  const location = bestEvent?.location ?? null;

  const summaryParts = [message, location].filter((part) => part && part.trim().length);
  const summary = summaryParts.length ? summaryParts.join(' • ') : null;

  const tag =
    trackInfo.latest_status?.status ??
    trackInfo.latest_status?.sub_status ??
    bestEvent?.stage ??
    bestEvent?.sub_status ??
    null;

  const tagNormalized = tag?.toLowerCase() ?? null;

  const deliveredEventTimes = events
    .filter((event) => {
      const stage = event.stage?.toLowerCase() ?? null;
      const subStatus = event.sub_status?.toLowerCase() ?? null;
      return stage === 'delivered' || subStatus === 'delivered';
    })
    .map((event) => toValidDate(event.time_utc ?? event.time_iso))
    .filter((date): date is Date => Boolean(date));

  const deliveredAtFromEvents = deliveredEventTimes.length
    ? new Date(Math.max(...deliveredEventTimes.map((date) => date.getTime())))
    : null;

  const deliveredAt =
    deliveredAtFromEvents ?? (tagNormalized === 'delivered' ? toValidDate(trackInfo.latest_event?.time_utc ?? trackInfo.latest_event?.time_iso) ?? checkpointAt : null);

  return {
    checkpointAt,
    summary,
    tag,
    deliveredAt,
  };
}

