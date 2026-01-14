import { EmbedBuilder } from 'discord.js';

export type TrackingEventType = 'carrier_scan' | 'movement' | 'delivered' | 'delay';

export type TrackingEmbedInput = {
  eventType: TrackingEventType;
  orderId: string;
  trackingNumber: string;
  carrierCode: string | null;
  checkpointAt: Date | null;
  deliveredAt: Date | null;
  tag: string | null;
  summary: string | null;
};

function titleForEvent(eventType: TrackingEventType): string {
  switch (eventType) {
    case 'carrier_scan':
      return 'Carrier scan received';
    case 'movement':
      return 'Shipment update';
    case 'delivered':
      return 'Delivered';
    case 'delay':
      return 'Delivery issue detected';
  }
}

function colorForEvent(eventType: TrackingEventType): number {
  switch (eventType) {
    case 'delivered':
      return 0x22c55e;
    case 'delay':
      return 0xef4444;
    case 'carrier_scan':
      return 0x3b82f6;
    case 'movement':
      return 0x8b5cf6;
  }
}

export function buildTrackingEmbed(input: TrackingEmbedInput): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(titleForEvent(input.eventType))
    .setColor(colorForEvent(input.eventType))
    .addFields(
      { name: 'Order', value: input.orderId, inline: true },
      { name: 'Tracking', value: input.trackingNumber, inline: true },
    )
    .setTimestamp(new Date());

  if (input.carrierCode) embed.addFields({ name: 'Carrier', value: input.carrierCode, inline: true });
  if (input.tag) embed.addFields({ name: 'Status', value: input.tag, inline: true });

  if (input.eventType === 'delivered' && input.deliveredAt) {
    embed.addFields({ name: 'Delivered at', value: input.deliveredAt.toISOString(), inline: false });
  } else if (input.checkpointAt) {
    embed.addFields({ name: 'Updated at', value: input.checkpointAt.toISOString(), inline: false });
  }

  if (input.summary) embed.setDescription(input.summary);

  return embed;
}

