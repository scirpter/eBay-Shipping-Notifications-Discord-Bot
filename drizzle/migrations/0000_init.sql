CREATE TABLE `ebay_accounts` (
	`id` varchar(26) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`ebay_user_id` varchar(128) NOT NULL,
	`environment` enum('sandbox','production') NOT NULL,
	`scopes` text NOT NULL,
	`access_token_enc` text,
	`access_token_expires_at` datetime,
	`refresh_token_enc` text NOT NULL,
	`refresh_token_expires_at` datetime,
	`last_order_sync_at` datetime,
	`last_tracking_sync_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ebay_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `ebay_accounts_environment_discord_user_id_unique` UNIQUE(`environment`,`discord_user_id`)
);
--> statement-breakpoint
CREATE TABLE `guild_ebay_accounts` (
	`id` varchar(26) NOT NULL,
	`guild_id` varchar(32) NOT NULL,
	`discord_user_id` varchar(32) NOT NULL,
	`ebay_account_id` varchar(26) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guild_ebay_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `guild_ebay_accounts_guild_id_discord_user_id_unique` UNIQUE(`guild_id`,`discord_user_id`)
);
--> statement-breakpoint
CREATE TABLE `guild_settings` (
	`guild_id` varchar(32) NOT NULL,
	`notify_channel_id` varchar(32),
	`mention_role_id` varchar(32),
	`send_channel` boolean NOT NULL DEFAULT true,
	`send_dm` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `guild_settings_guild_id` PRIMARY KEY(`guild_id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(26) NOT NULL,
	`ebay_account_id` varchar(26) NOT NULL,
	`order_id` varchar(128) NOT NULL,
	`order_created_at` datetime,
	`last_modified_at` datetime,
	`fulfillment_status` enum('NOT_STARTED','IN_PROGRESS','FULFILLED') NOT NULL,
	`buyer_username` varchar(128),
	`summary` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `orders_ebay_account_id_order_id_unique` UNIQUE(`ebay_account_id`,`order_id`)
);
--> statement-breakpoint
CREATE TABLE `shipment_trackings` (
	`id` varchar(26) NOT NULL,
	`ebay_account_id` varchar(26) NOT NULL,
	`order_id` varchar(128) NOT NULL,
	`fulfillment_id` varchar(128),
	`carrier_code` varchar(64),
	`tracking_number` varchar(128) NOT NULL,
	`provider` enum('aftership') NOT NULL DEFAULT 'aftership',
	`provider_ref` varchar(128),
	`last_checkpoint_at` datetime,
	`delivered_at` datetime,
	`last_tag` varchar(64),
	`last_checkpoint_summary` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shipment_trackings_id` PRIMARY KEY(`id`),
	CONSTRAINT `shipment_trackings_ebay_account_id_tracking_number_unique` UNIQUE(`ebay_account_id`,`tracking_number`)
);
