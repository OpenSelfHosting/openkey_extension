import { describe, expect, it } from "vitest";

/**
 * Sync wire-format interop with openkey_server SyncRequest / SyncResponse
 * and openkey_app SyncService push maps.
 */
type SyncPushBody = {
  since_revision: number;
  collections: Array<{
    uuid: string;
    encrypted_name: string;
    icon?: string;
    color?: number | null;
    parent_uuid?: string | null;
    sort_order?: number;
    revision: number;
    is_deleted: boolean;
  }>;
  entries: Array<{
    uuid: string;
    collection_uuid: string | null;
    encrypted_payload: string;
    revision: number;
    is_deleted: boolean;
  }>;
  attachments?: Array<{
    uuid: string;
    entry_uuid: string;
    filename: string;
    size_bytes: number;
    content_type?: string | null;
    revision: number;
    is_deleted: boolean;
    encrypted_blob: string;
  }>;
};

function assertSyncPushShape(body: SyncPushBody): void {
  expect(typeof body.since_revision).toBe("number");
  expect(body.since_revision).toBeGreaterThanOrEqual(0);
  for (const c of body.collections) {
    expect(c.uuid.length).toBeGreaterThan(0);
    expect(c.encrypted_name.length).toBeGreaterThan(0);
    expect(c.revision).toBeGreaterThanOrEqual(1);
    expect(typeof c.is_deleted).toBe("boolean");
  }
  for (const e of body.entries) {
    expect(e.uuid.length).toBeGreaterThan(0);
    expect(e.encrypted_payload.length).toBeGreaterThan(0);
    expect(e.revision).toBeGreaterThanOrEqual(1);
    expect(typeof e.is_deleted).toBe("boolean");
    expect(
      e.collection_uuid === null || typeof e.collection_uuid === "string",
    ).toBe(true);
  }
}

describe("sync payload interop shape", () => {
  it("accepts app/extension push body", () => {
    const body: SyncPushBody = {
      since_revision: 0,
      collections: [
        {
          uuid: "col-1",
          encrypted_name: "enc-name",
          icon: "material:folder",
          parent_uuid: null,
          sort_order: 0,
          revision: 1,
          is_deleted: false,
        },
      ],
      entries: [
        {
          uuid: "entry-1",
          collection_uuid: "col-1",
          encrypted_payload: "ciphertext",
          revision: 1,
          is_deleted: false,
        },
      ],
      attachments: [
        {
          uuid: "att-1",
          entry_uuid: "entry-1",
          filename: "f.bin",
          size_bytes: 4,
          content_type: "application/octet-stream",
          revision: 1,
          is_deleted: false,
          encrypted_blob: "YmxvYg==",
        },
      ],
    };
    assertSyncPushShape(body);
  });

  it("maps camelCase stored entries to snake_case wire fields", () => {
    const stored = {
      uuid: "e1",
      collectionUuid: null as string | null,
      encryptedPayload: "ct",
      revision: 2,
      isDeleted: false,
    };
    const wire = {
      uuid: stored.uuid,
      collection_uuid: stored.collectionUuid,
      encrypted_payload: stored.encryptedPayload,
      revision: stored.revision,
      is_deleted: stored.isDeleted,
    };
    assertSyncPushShape({
      since_revision: 0,
      collections: [],
      entries: [wire],
    });
    expect(Object.keys(wire).sort()).toEqual(
      [
        "uuid",
        "collection_uuid",
        "encrypted_payload",
        "revision",
        "is_deleted",
      ].sort(),
    );
  });
});
