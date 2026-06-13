CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "categories_parent_id_idx" ON "categories" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_payments_debt_id_idx" ON "debt_payments" USING btree ("debt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debts_user_id_idx" ON "debts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "savings_contributions_goal_id_idx" ON "savings_contributions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "savings_goals_user_id_idx" ON "savings_goals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_expenses_group_id_idx" ON "split_expenses" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_groups_user_id_idx" ON "split_groups" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "split_settlements_group_id_idx" ON "split_settlements" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "templates_user_id_idx" ON "templates" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_tags_tag_id_idx" ON "transaction_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_date_idx" ON "transactions" USING btree ("user_id","date","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_user_type_date_idx" ON "transactions" USING btree ("user_id","type","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_account_id_idx" ON "transactions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_to_account_id_idx" ON "transactions" USING btree ("to_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_category_id_idx" ON "transactions" USING btree ("category_id");