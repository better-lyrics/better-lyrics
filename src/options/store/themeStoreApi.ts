import { LOG_PREFIX_STORE, THEME_STORE_API_URL } from "@constants";
import type { AllThemeStats, ApiResult, RatingResult } from "./types";
import { fetchWithTimeout } from "./themeStoreService";
import {
  signRating,
  signInstall,
  signPayload,
  isKeyRegistered,
  markKeyRegistered,
  getCertificate,
  setCertificate,
} from "./keyIdentity";

const THEME_ID_MAX_LENGTH = 128;
const THEME_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function isValidThemeId(themeId: string): boolean {
  return (
    typeof themeId === "string" &&
    themeId.length > 0 &&
    themeId.length <= THEME_ID_MAX_LENGTH &&
    THEME_ID_PATTERN.test(themeId)
  );
}

function isValidRating(rating: number): boolean {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}

export async function fetchAllStats(): Promise<ApiResult<AllThemeStats>> {
  try {
    const response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/stats`);
    if (!response.ok) {
      const error = `Failed to fetch stats: ${response.status}`;
      console.warn(LOG_PREFIX_STORE, error);
      return { success: false, data: {}, error };
    }
    return { success: true, data: await response.json() };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    console.warn(LOG_PREFIX_STORE, "Failed to fetch stats:", error);
    return { success: false, data: {}, error };
  }
}

export async function trackInstall(themeId: string): Promise<ApiResult<number | null>> {
  if (!isValidThemeId(themeId)) {
    return { success: false, data: null, error: "Invalid theme ID" };
  }

  try {
    const signed = await signInstall(themeId);
    let needsRegistration = !(await isKeyRegistered());

    const body: Record<string, unknown> = {
      payload: signed.payload,
      signature: signed.signature,
    };

    if (needsRegistration) {
      body.publicKey = signed.publicKey;
    }

    let response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/install/${encodeURIComponent(themeId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 400 && !needsRegistration) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error === "PUBLIC_KEY_REQUIRED") {
        body.publicKey = signed.publicKey;
        needsRegistration = true;
        response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/install/${encodeURIComponent(themeId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const error = `Failed to track install: ${response.status}`;
      console.warn(LOG_PREFIX_STORE, error);
      return { success: false, data: null, error };
    }

    if (needsRegistration) {
      await markKeyRegistered();
    }

    const data = await response.json();
    return { success: true, data: data.count };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    console.warn(LOG_PREFIX_STORE, "Failed to track install:", error);
    return { success: false, data: null, error };
  }
}

export async function submitRating(
  themeId: string,
  rating: number,
  turnstileToken?: string
): Promise<ApiResult<RatingResult | null>> {
  if (!isValidThemeId(themeId)) {
    return { success: false, data: null, error: "Invalid theme ID" };
  }

  if (!isValidRating(rating)) {
    return { success: false, data: null, error: "Rating must be an integer between 1 and 5" };
  }

  try {
    const signed = await signRating(themeId, rating);
    const certificate = await getCertificate();
    let needsRegistration = !(await isKeyRegistered());

    const body: Record<string, unknown> = {
      payload: signed.payload,
      signature: signed.signature,
    };

    if (certificate) {
      body.certificate = certificate;
    } else if (turnstileToken) {
      body.turnstileToken = turnstileToken;
      body.publicKey = signed.publicKey;
      needsRegistration = true;
    } else {
      return { success: false, data: null, error: "CERTIFICATE_OR_TOKEN_REQUIRED" };
    }

    if (needsRegistration && !body.publicKey) {
      body.publicKey = signed.publicKey;
    }

    let response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/rate/${encodeURIComponent(themeId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 400 && !needsRegistration) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error === "PUBLIC_KEY_REQUIRED") {
        body.publicKey = signed.publicKey;
        needsRegistration = true;
        response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/rate/${encodeURIComponent(themeId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }

    if (!response.ok) {
      const error = `Failed to submit rating: ${response.status}`;
      console.warn(LOG_PREFIX_STORE, error);
      return { success: false, data: null, error };
    }

    if (needsRegistration) {
      await markKeyRegistered();
    }

    const data = await response.json();

    if (data.certificate && typeof data.certificate === "string") {
      await setCertificate(data.certificate);
      console.log(LOG_PREFIX_STORE, "Certificate received and stored");
    }

    return { success: true, data };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    console.warn(LOG_PREFIX_STORE, "Failed to submit rating:", error);
    return { success: false, data: null, error };
  }
}

export async function fetchUserRatings(): Promise<ApiResult<Record<string, number>>> {
  try {
    const signed = await signPayload({});
    let needsRegistration = !(await isKeyRegistered());

    const body: Record<string, unknown> = {
      payload: signed.payload,
      signature: signed.signature,
    };

    if (needsRegistration) {
      body.publicKey = signed.publicKey;
    }

    let response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/user/ratings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (response.status === 400 && !needsRegistration) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error === "PUBLIC_KEY_REQUIRED") {
        body.publicKey = signed.publicKey;
        needsRegistration = true;
        response = await fetchWithTimeout(`${THEME_STORE_API_URL}/api/user/ratings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }

    if (response.status === 404) {
      const errorData = await response.json().catch(() => null);
      if (errorData?.error === "KEY_NOT_FOUND") {
        return { success: true, data: {} };
      }
    }

    if (!response.ok) {
      const error = `Failed to fetch user ratings: ${response.status}`;
      console.warn(LOG_PREFIX_STORE, error);
      return { success: false, data: {}, error };
    }

    if (needsRegistration) {
      await markKeyRegistered();
    }

    const data = await response.json();
    return { success: true, data };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error";
    console.warn(LOG_PREFIX_STORE, "Failed to fetch user ratings:", error);
    return { success: false, data: {}, error };
  }
}
