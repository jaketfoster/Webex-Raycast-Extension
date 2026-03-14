import { OAuth } from "@raycast/api";
import fetch from "node-fetch";

const CLIENT_ID = "C5717643d56bbc4918ab91b90738d6cc4a950bde01713c2b54a9ea1bd391bd782";
const CLIENT_SECRET = "db42a98b17aa1f7d21653fcf0f23977cf2b2689eecb6f13ce7dfe3ed278ddb3b";

const client = new OAuth.PKCEClient({
  redirectMethod: OAuth.RedirectMethod.Web,
  providerName: "Webex",
  providerIcon: "icon.png",
  description: "Connect your Webex account",
});

export async function logout() {
  await client.removeTokens();
}

export async function authorize(): Promise<string> {
  const tokenSet = await client.getTokens();

  if (tokenSet?.accessToken) {
    if (tokenSet.refreshToken && tokenSet.isExpired()) {
      const { accessToken } = await refreshTokens(tokenSet.refreshToken);
      return accessToken;
    }
    return tokenSet.accessToken;
  }

  const authRequest = await client.authorizationRequest({
    endpoint: "https://webexapis.com/v1/authorize",
    clientId: CLIENT_ID,
    scope:
      "spark:rooms_read spark:messages_read spark:messages_write spark:memberships_read spark:people_read meeting:schedules_read meeting:schedules_write",
  });

  console.log("OAuth redirect URI:", authRequest.redirectURI);
  console.log("OAuth full URL:", authRequest.toURL());

  const { authorizationCode } = await client.authorize(authRequest);
  const tokens = await fetchTokens(authRequest, authorizationCode);
  return tokens.accessToken;
}

async function fetchTokens(
  authRequest: OAuth.AuthorizationRequest,
  authorizationCode: string,
): Promise<{ accessToken: string }> {
  const response = await fetch("https://webexapis.com/v1/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: authorizationCode,
      code_verifier: authRequest.codeVerifier,
      redirect_uri: authRequest.redirectURI,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  const tokenResponse = (await response.json()) as OAuth.TokenResponse;
  await client.setTokens(tokenResponse);

  return { accessToken: tokenResponse.access_token };
}

async function refreshTokens(refreshToken: string): Promise<{ accessToken: string }> {
  const response = await fetch("https://webexapis.com/v1/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.statusText}`);
  }

  const tokenResponse = (await response.json()) as OAuth.TokenResponse;
  await client.setTokens(tokenResponse);

  return { accessToken: tokenResponse.access_token };
}
