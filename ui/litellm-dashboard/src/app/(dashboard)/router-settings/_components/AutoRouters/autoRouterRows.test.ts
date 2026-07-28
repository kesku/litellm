import { describe, expect, it } from "vitest";

import { isComplexityRouter, toAutoRouterRow, toAutoRouterRows } from "./autoRouterRows";

const complexityDeployment = {
  model_name: "tri-tier-router",
  litellm_params: {
    model: "auto_router/complexity_router",
    complexity_router_config: {
      tiers: {
        SIMPLE: ["gpt-4o-mini"],
        MEDIUM: ["anthropic-sonnet-4-6"],
        COMPLEX: ["anthropic-opus-4-6", "gpt-4o-mini"],
        REASONING: [],
      },
      classifier_type: "heuristic",
    },
    complexity_router_default_model: "gpt-4o-mini",
  },
  model_info: { id: "cid-1", created_at: "2026-07-28T21:40:09.900000+00:00" },
};

const semanticDeployment = {
  model_name: "support-router",
  litellm_params: {
    model: "auto_router/support-router",
    auto_router_config: JSON.stringify({
      routes: [
        { name: "gpt-4o-mini", utterances: ["reset my password"] },
        { name: "anthropic-opus-4-6", utterances: ["design a distributed system"] },
      ],
    }),
    auto_router_default_model: "gpt-4o-mini",
  },
  model_info: { id: "sid-1", created_at: "2026-07-27T10:00:00.000000+00:00" },
};

describe("autoRouterRows", () => {
  it("classifies a complexity router and unions its tier models as targets", () => {
    const row = toAutoRouterRow(complexityDeployment, 0);

    expect(row.kind).toBe("complexity");
    expect(row.strategy).toBe("Heuristic classifier");
    // Union across tiers, de-duplicated: gpt-4o-mini appears in both SIMPLE and COMPLEX.
    expect(row.targets).toEqual(["gpt-4o-mini", "anthropic-sonnet-4-6", "anthropic-opus-4-6"]);
    expect(row.defaultModel).toBe("gpt-4o-mini");
    expect(row.id).toBe("cid-1");
  });

  it("parses a semantic router whose config arrives as a JSON string", () => {
    const row = toAutoRouterRow(semanticDeployment, 0);

    expect(row.kind).toBe("semantic");
    expect(row.strategy).toBe("2 semantic routes");
    expect(row.targets).toEqual(["gpt-4o-mini", "anthropic-opus-4-6"]);
    expect(row.defaultModel).toBe("gpt-4o-mini");
  });

  it("shows a tier pinned as a bare string, which the backend accepts as `str | list[str]`", () => {
    const row = toAutoRouterRow(
      {
        ...complexityDeployment,
        litellm_params: {
          ...complexityDeployment.litellm_params,
          complexity_router_config: {
            tiers: { SIMPLE: "gpt-4o-mini", MEDIUM: ["anthropic-sonnet-4-6"], COMPLEX: "", REASONING: [] },
            classifier_type: "heuristic",
          },
        },
      },
      0,
    );

    expect(row.targets).toEqual(["gpt-4o-mini", "anthropic-sonnet-4-6"]);
  });

  it("labels an adaptive LLM-classified router with both facts", () => {
    const row = toAutoRouterRow(
      {
        ...complexityDeployment,
        litellm_params: {
          ...complexityDeployment.litellm_params,
          complexity_router_config: { tiers: {}, classifier_type: "llm", adaptive: true },
        },
      },
      0,
    );

    expect(row.strategy).toBe("LLM classifier, adaptive");
  });

  it("treats a deployment carrying complexity_router_config as complexity even off the canonical model string", () => {
    expect(
      isComplexityRouter({
        model_name: "legacy",
        litellm_params: { model: "auto_router/legacy", complexity_router_config: { tiers: {} } },
      }),
    ).toBe(true);
  });

  it("survives an unparseable config instead of throwing", () => {
    const row = toAutoRouterRow(
      {
        model_name: "broken",
        litellm_params: { model: "auto_router/broken", auto_router_config: "{not json" },
        model_info: { id: "bid-1" },
      },
      0,
    );

    expect(row.kind).toBe("semantic");
    expect(row.targets).toEqual([]);
    expect(row.strategy).toBe("0 semantic routes");
  });

  it("falls back to a stable synthetic id when the deployment has no model_info id", () => {
    const rows = toAutoRouterRows([
      { model_name: "a", litellm_params: { model: "auto_router/a" } },
      { model_name: "b", litellm_params: { model: "auto_router/b" } },
    ]);

    expect(rows.map((row) => row.id)).toEqual(["a-0", "b-1"]);
  });
});
