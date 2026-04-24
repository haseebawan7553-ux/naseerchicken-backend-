import { prisma } from './prisma.js'

export async function ensureAuthSchema() {
  const schemaLockId = 842114209331

  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(${schemaLockId});`)
  try {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
          CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'STAFF_USER');
        END IF;
      END
      $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "passwordHash" TEXT NOT NULL,
        "role" "Role" NOT NULL DEFAULT 'STAFF_USER'::"Role",
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'User'
            AND column_name = 'role'
            AND udt_name <> 'Role'
        ) THEN
          ALTER TABLE "User"
          ALTER COLUMN "role" DROP DEFAULT;

          ALTER TABLE "User"
          ALTER COLUMN "role" TYPE "Role"
          USING (
            CASE
              WHEN "role"::TEXT IN ('SUPER_ADMIN', 'STAFF_USER') THEN "role"::TEXT::"Role"
              ELSE 'STAFF_USER'::"Role"
            END
          );
        END IF;

        ALTER TABLE "User"
        ALTER COLUMN "role" SET DEFAULT 'STAFF_USER'::"Role";
      END
      $$;
    `)

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User" ("email");
    `)
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(${schemaLockId});`)
  }
}
