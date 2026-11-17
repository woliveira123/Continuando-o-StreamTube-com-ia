import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVideos1794849765613 implements MigrationInterface {
  name = 'CreateVideos1794849765613';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "videos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "channel_id" uuid NOT NULL, "title" character varying(200) NOT NULL, "filename" character varying(255) NOT NULL, "expected_size" bigint NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'draft', "original_key" character varying NOT NULL, "upload_id" text, "stream_key" text, "thumbnail_key" text, "duration" double precision, "metadata" jsonb, "error_code" character varying, "generation" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_67f694817d0262c0bfcec39da21" UNIQUE ("original_key"), CONSTRAINT "CHK_video_status" CHECK ("status" IN ('draft', 'processing', 'ready', 'error')), CONSTRAINT "CHK_video_size" CHECK ("expected_size" > 0 AND "expected_size" <= 10000000000), CONSTRAINT "PK_e4c86c0cf95aff16e9fb8220f6b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ece1558efc6efd53eb530479db" ON "videos" ("status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "videos" ADD CONSTRAINT "FK_023a8e4f3f1a34ff3d8ca04a4cc" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "videos" DROP CONSTRAINT "FK_023a8e4f3f1a34ff3d8ca04a4cc"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ece1558efc6efd53eb530479db"`,
    );
    await queryRunner.query(`DROP TABLE "videos"`);
  }
}
