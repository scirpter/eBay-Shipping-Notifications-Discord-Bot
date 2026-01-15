ALTER TABLE `shipment_trackings`
  MODIFY COLUMN `provider` enum('aftership','seventeen-track') NOT NULL DEFAULT 'seventeen-track';

