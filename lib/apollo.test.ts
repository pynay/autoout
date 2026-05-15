import { afterEach, describe, it } from "node:test";
import * as assert from "node:assert/strict";
import { enrichDiscoveredPeople } from "./apollo";

const originalApiKey = process.env.APOLLO_API_KEY;
const originalFetch = globalThis.fetch;

afterEach(() => {
  if (originalApiKey === undefined) {
    delete process.env.APOLLO_API_KEY;
  } else {
    process.env.APOLLO_API_KEY = originalApiKey;
  }
  globalThis.fetch = originalFetch;
});

describe("enrichDiscoveredPeople", () => {
  it("enriches discovered people using Apollo people match, not people search", async () => {
    process.env.APOLLO_API_KEY = "apollo-key";
    const calls: Array<{ url: string; init: RequestInit }> = [];

    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      assert.ok(init, "expected fetch init");
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          person: {
            name: "Ada Lovelace",
            title: "VP Engineering",
            linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
            city: "London",
            country: "United Kingdom",
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
    assert.equal(calls[0].url, "https://api.apollo.io/api/v1/people/match");
    assert.equal(calls[0].init.method, "POST");
    assert.deepEqual(calls[0].init.headers, {
      "Cache-Control": "no-cache",
      "Content-Type": "application/json",
      "X-Api-Key": "apollo-key",
    });
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
      name: "Ada Lovelace",
      linkedin_url: "https://www.linkedin.com/in/ada-lovelace",
      organization_name: "Analytical Engines Inc",
      domain: "analytical.example",
      reveal_personal_emails: false,
      reveal_phone_number: false,
    });
    assert.deepEqual(people, [
      {
        fullName: "Ada Lovelace",
        title: "VP Engineering",
        linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
        location: "London, United Kingdom",
      },
    ]);
  });

  it("keeps the discovered person when Apollo does not return a person", async () => {
    process.env.APOLLO_API_KEY = "apollo-key";
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ person: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const people = await enrichDiscoveredPeople(
      [{ fullName: "Grace Hopper", title: "CTO", linkedinUrl: null, location: "New York" }],
      { companyName: "Compiler Co", companyDomain: "compiler.example" },
    );

    assert.deepEqual(people, [
      { fullName: "Grace Hopper", title: "CTO", linkedinUrl: null, location: "New York" },
    ]);
  });
});
