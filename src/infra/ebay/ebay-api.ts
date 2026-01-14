import { z } from 'zod';

import type { EbayEnvironment } from '../db/repositories/ebay-accounts-repo.js';
import { fetchJson } from '../http/fetch-json.js';
import { getEbayApiBaseUrl } from './ebay-urls.js';

const FulfillmentStatusSchema = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'FULFILLED']);

const OrderSchema = z.object({
  orderId: z.string().min(1),
  creationDate: z.string().min(1).optional(),
  lastModifiedDate: z.string().min(1).optional(),
  orderFulfillmentStatus: FulfillmentStatusSchema,
  sellerId: z.string().min(1).optional(),
  buyer: z
    .object({
      username: z.string().min(1).optional(),
    })
    .optional(),
  lineItems: z
    .array(
      z.object({
        title: z.string().min(1).optional(),
        sku: z.string().min(1).optional(),
        quantity: z.number().int().optional(),
      }),
    )
    .optional(),
});

const GetOrdersResponseSchema = z.object({
  orders: z.array(OrderSchema).optional(),
  total: z.number().int().optional(),
  next: z.string().url().optional(),
});

export type EbayOrder = z.infer<typeof OrderSchema>;

const ShippingFulfillmentSchema = z.object({
  fulfillmentId: z.string().min(1),
  shipmentTrackingNumber: z.string().min(1).optional(),
  shippedDate: z.string().min(1).optional(),
  shippingCarrierCode: z.string().min(1).optional(),
});

const GetShippingFulfillmentsResponseSchema = z.object({
  fulfillments: z.array(ShippingFulfillmentSchema).optional(),
});

export type EbayShippingFulfillment = z.infer<typeof ShippingFulfillmentSchema>;

export type EbayApiClient = {
  getOrders: (input: { accessToken: string; filter: string; limit?: number; offset?: number }) => Promise<EbayOrder[]>;
  getShippingFulfillments: (input: {
    accessToken: string;
    orderId: string;
  }) => Promise<EbayShippingFulfillment[]>;
};

export function createEbayApiClient(environment: EbayEnvironment): EbayApiClient {
  const baseUrl = getEbayApiBaseUrl(environment);

  return {
    async getOrders(input) {
      const url = new URL(`${baseUrl}/sell/fulfillment/v1/order`);
      url.searchParams.set('filter', input.filter);
      url.searchParams.set('limit', String(input.limit ?? 50));
      url.searchParams.set('offset', String(input.offset ?? 0));

      const response = await fetchJson<unknown>(url.toString(), {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
      });

      const parsed = GetOrdersResponseSchema.parse(response.data);
      return parsed.orders ?? [];
    },

    async getShippingFulfillments(input) {
      const url = `${baseUrl}/sell/fulfillment/v1/order/${encodeURIComponent(input.orderId)}/shipping_fulfillment`;
      const response = await fetchJson<unknown>(url, {
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
        },
      });

      const parsed = GetShippingFulfillmentsResponseSchema.parse(response.data);
      return parsed.fulfillments ?? [];
    },
  };
}

export function buildOrdersFilter(input: { lastModifiedFrom: Date; includeInProgressAndFulfilled?: boolean }): string {
  const from = input.lastModifiedFrom.toISOString();
  const lastModifiedPart = `lastmodifieddate:[${from}..]`;
  const fulfillmentPart = input.includeInProgressAndFulfilled === false ? '' : ',orderfulfillmentstatus:{FULFILLED|IN_PROGRESS}';
  return `${lastModifiedPart}${fulfillmentPart}`;
}

