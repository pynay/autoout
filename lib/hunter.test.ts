import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { enrichDiscoveredPeople } from "./hunter";

const originalApiKey = process.env.HUNTER_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.HUNTER_API_KEY;
  } else {
    process.env.HUNTER_API_KEY = originalApiKey;
  }
  globalThis.fetch = originalFetch;
});

describe("enrichDiscoveredPeople", () => {
  it("finds work emails with Hunter email finder", async () => {
    process.env.HUNTER_API_KEY = "hunter-key";
    const calls: string[] = [];

    globalThis.fetch = (async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({
          data: {
            email: "ada@analytical.example",
            score: 96,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const people = await enrichDiscoveredPeople(
      [
        {
          fullName: "Ada Lovelace",
          title: "Engineering leader",
          linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
          location: null,
        },
      ],
      { companyName: "Analytical Engines Inc", companyDomain: "https://www.analytical.example/path" },
    );

    assert.equal(calls.length, 1);
    const url = new URL(calls[0]);
    assert.equal(`${url.origin}${url.pathname}`, "https://api.hunter.io/v2/email-finder");
    assert.equal(url.searchParams.get("domain"), "analytical.example");
    assert.equal(url.searchParams.get("full_name"), "Ada Lovelace");
    assert.equal(url.searchParams.get("api_key"), "hunter-key");
    assert.deepEqual(people, [
      {
        fullName: "Ada Lovelace",
        title: "Engineering leader",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        location: null,
        emailAddress: "ada@analytical.example",
        emailConfidence: 96,
      },
    ]);
  });

  it("keeps discovered people when Hunter does not find an email", async () => {
    process.env.HUNTER_API_KEY = "hunter-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { email: null, score: null } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const people = await enrichDiscoveredPeople(
      [{ fullName: "Grace Hopper", title: "CTO", linkedinUrl: null, location: "New York" }],
      { companyName: "Compiler Co", companyDomain: "compiler.example" },
    );

    assert.deepEqual(people, [
      {
        fullName: "Grace Hopper",
        title: "CTO",
        linkedinUrl: null,
        location: "New York",
        emailAddress: null,
        emailConfidence: null,
      },
    ]);
  });

  it("keeps discovered people when Hunter enrichment fails", async () => {
    process.env.HUNTER_API_KEY = "hunter-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ errors: [{ details: "Invalid API key" }] }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const people = await enrichDiscoveredPeople(
      [{ fullName: "Katherine Johnson", title: "Director", linkedinUrl: null, location: null }],
      { companyName: "Space Co", companyDomain: "space.example" },
    );

    assert.deepEqual(people, [
      {
        fullName: "Katherine Johnson",
        title: "Director",
        linkedinUrl: null,
        location: null,
        emailAddress: null,
        emailConfidence: null,
      },
    ]);
  });
});
