/**
 * MAIN-world WebAuthn hook. Relays publicKey create/get to the isolated content script.
 * Injected at document_start via a <script> tag (works in Chrome + Firefox).
 */

(() => {
  const SOURCE = "openkey-passkey";
  const nativeCreate = navigator.credentials.create.bind(navigator.credentials);
  const nativeGet = navigator.credentials.get.bind(navigator.credentials);

  type WireValue =
    | null
    | boolean
    | number
    | string
    | WireValue[]
    | { [k: string]: WireValue }
    | { __openkey_bin: string };

  function bufferToB64(buf: ArrayBuffer | ArrayBufferView): string {
    const bytes =
      buf instanceof ArrayBuffer
        ? new Uint8Array(buf)
        : new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    let s = "";
    bytes.forEach((b) => (s += String.fromCharCode(b)));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64ToBuffer(s: string): ArrayBuffer {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }

  function serialize(value: unknown): WireValue {
    if (value == null) return value as null;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return value;
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      return { __openkey_bin: bufferToB64(value as ArrayBuffer | ArrayBufferView) };
    }
    if (Array.isArray(value)) return value.map(serialize);
    if (typeof value === "object") {
      const out: { [k: string]: WireValue } = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "signal" || typeof v === "function") continue;
        out[k] = serialize(v);
      }
      return out;
    }
    return null;
  }

  function requestBridge(
    type: "create" | "get",
    publicKey: unknown,
  ): Promise<
    | { ok: true; credential: Record<string, unknown> }
    | { ok: false; fallback: true }
    | { ok: false; error: string; name?: string }
  > {
    const id = crypto.randomUUID();
    return new Promise((resolve) => {
      let settled = false;
      const finish = (
        payload:
          | { ok: true; credential: Record<string, unknown> }
          | { ok: false; fallback: true }
          | { ok: false; error: string; name?: string },
      ) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve(payload);
      };
      const onMessage = (event: MessageEvent) => {
        const data = event.data;
        if (!data || data.source !== SOURCE || data.id !== id) return;
        if (data.type !== "response") return;
        finish(data.payload);
      };
      window.addEventListener("message", onMessage);
      window.postMessage(
        {
          source: SOURCE,
          type: "request",
          id,
          requestType: type,
          publicKey: serialize(publicKey),
          origin: location.origin,
        },
        "*",
      );
      const timer = window.setTimeout(() => {
        finish({ ok: false, fallback: true });
      }, 120_000);
    });
  }

  function reviveCredential(raw: Record<string, unknown>): PublicKeyCredential {
    const response = (raw.response ?? {}) as Record<string, unknown>;
    const rawId = b64ToBuffer(String(raw.rawId ?? raw.id));
    const clientDataJSON = b64ToBuffer(String(response.clientDataJSON));

    const base = {
      id: String(raw.id),
      rawId,
      type: "public-key" as const,
      authenticatorAttachment: (raw.authenticatorAttachment as AuthenticatorAttachment) ??
        "cross-platform",
      getClientExtensionResults: () =>
        (raw.clientExtensionResults as AuthenticationExtensionsClientOutputs) ?? {},
      toJSON() {
        return raw;
      },
    };

    if (response.attestationObject) {
      const attestationObject = b64ToBuffer(String(response.attestationObject));
      const attestationResponse = {
        clientDataJSON,
        attestationObject,
        getAuthenticatorData: () => new ArrayBuffer(0),
        getPublicKey: () =>
          response.publicKey ? b64ToBuffer(String(response.publicKey)) : null,
        getPublicKeyAlgorithm: () =>
          typeof response.publicKeyAlgorithm === "number"
            ? response.publicKeyAlgorithm
            : -7,
        getTransports: () =>
          (response.transports as AuthenticatorTransport[]) ?? ["internal"],
      };
      return {
        ...base,
        response: attestationResponse,
      } as unknown as PublicKeyCredential;
    }

    const assertionResponse = {
      clientDataJSON,
      authenticatorData: b64ToBuffer(String(response.authenticatorData)),
      signature: b64ToBuffer(String(response.signature)),
      userHandle: response.userHandle
        ? b64ToBuffer(String(response.userHandle))
        : null,
    };
    return {
      ...base,
      response: assertionResponse,
    } as unknown as PublicKeyCredential;
  }

  function isPublicKeyOptions(options?: CredentialCreationOptions | CredentialRequestOptions) {
    return !!(options && "publicKey" in options && options.publicKey);
  }

  function wantsPlatformOnly(options?: CredentialCreationOptions): boolean {
    const attachment =
      options?.publicKey?.authenticatorSelection?.authenticatorAttachment;
    return attachment === "platform";
  }

  function isConditional(options?: CredentialRequestOptions): boolean {
    return (options as { mediation?: string } | undefined)?.mediation === "conditional";
  }

  navigator.credentials.create = async function openkeyCreate(
    options?: CredentialCreationOptions,
  ): Promise<Credential | null> {
    if (!isPublicKeyOptions(options) || wantsPlatformOnly(options)) {
      return nativeCreate(options);
    }
    try {
      const result = await requestBridge("create", options!.publicKey);
      if (!result.ok) {
        if ("fallback" in result && result.fallback) {
          return nativeCreate(options);
        }
        const errResult = result as { ok: false; error: string; name?: string };
        throw new DOMException(
          errResult.error || "OpenKey passkey create failed",
          errResult.name || "NotAllowedError",
        );
      }
      return reviveCredential(result.credential);
    } catch (e) {
      if (e instanceof DOMException) throw e;
      return nativeCreate(options);
    }
  };

  navigator.credentials.get = async function openkeyGet(
    options?: CredentialRequestOptions,
  ): Promise<Credential | null> {
    if (!isPublicKeyOptions(options) || isConditional(options)) {
      return nativeGet(options);
    }
    try {
      const result = await requestBridge("get", options!.publicKey);
      if (!result.ok) {
        if ("fallback" in result && result.fallback) {
          return nativeGet(options);
        }
        const errResult = result as { ok: false; error: string; name?: string };
        throw new DOMException(
          errResult.error || "OpenKey passkey get failed",
          errResult.name || "NotAllowedError",
        );
      }
      return reviveCredential(result.credential);
    } catch (e) {
      if (e instanceof DOMException) throw e;
      return nativeGet(options);
    }
  };
})();
