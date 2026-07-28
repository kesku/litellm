import { AutoRouterDeployment } from "@/app/(dashboard)/hooks/models/useModels";
import { normalizeTierModels } from "@/components/add_model/complexity_router_tiers";

export type AutoRouterKind = "complexity" | "semantic";

export interface AutoRouterRow {
  id: string;
  name: string;
  kind: AutoRouterKind;
  /** Short label for the Type pill: the classifier for a complexity router, else "Semantic". */
  typeLabel: string;
  strategy: string;
  targets: string[];
  defaultModel: string | null;
  createdAt: string | null;
  deployment: AutoRouterDeployment;
}

const COMPLEXITY_ROUTER_MODEL = "auto_router/complexity_router";

const asRecord = (value: unknown): Record<string, unknown> => {
  const parsed: unknown = typeof value === "string" ? safeParse(value) : value;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
};

const safeParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

export const isComplexityRouter = (deployment: AutoRouterDeployment): boolean =>
  deployment.litellm_params?.model === COMPLEXITY_ROUTER_MODEL ||
  deployment.litellm_params?.complexity_router_config != null;

const complexityTargets = (config: Record<string, unknown>): string[] => {
  const tiers = asRecord(config.tiers);
  return Array.from(new Set(Object.values(tiers).flatMap(normalizeTierModels)));
};

const semanticTargets = (config: Record<string, unknown>): string[] => {
  const routes = Array.isArray(config.routes) ? config.routes : [];
  return Array.from(
    new Set(
      routes
        .map((route) => asRecord(route).name)
        .filter((name): name is string => typeof name === "string" && name.length > 0),
    ),
  );
};

export const complexityTypeLabel = (config: Record<string, unknown>): string =>
  config.classifier_type === "llm" ? "LLM Classifier" : "Heuristic";

const complexityStrategy = (config: Record<string, unknown>): string => {
  const classifier = config.classifier_type === "llm" ? "LLM classifier" : "Heuristic classifier";
  return config.adaptive === true ? `${classifier}, adaptive` : classifier;
};

export const toAutoRouterRow = (deployment: AutoRouterDeployment, index: number): AutoRouterRow => {
  const params = deployment.litellm_params ?? {};
  const info = deployment.model_info ?? {};
  const name = deployment.model_name ?? "";
  const id = info.id ?? `${name}-${index}`;

  if (isComplexityRouter(deployment)) {
    const config = asRecord(params.complexity_router_config);
    return {
      id,
      name,
      kind: "complexity",
      typeLabel: complexityTypeLabel(config),
      strategy: complexityStrategy(config),
      targets: complexityTargets(config),
      defaultModel: params.complexity_router_default_model ?? null,
      createdAt: info.created_at ?? null,
      deployment,
    };
  }

  const config = asRecord(params.auto_router_config);
  const routeCount = semanticTargets(config).length;
  return {
    id,
    name,
    kind: "semantic",
    typeLabel: "Semantic",
    strategy: routeCount === 1 ? "1 semantic route" : `${routeCount} semantic routes`,
    targets: semanticTargets(config),
    defaultModel: params.auto_router_default_model ?? null,
    createdAt: info.created_at ?? null,
    deployment,
  };
};

export const toAutoRouterRows = (deployments: AutoRouterDeployment[]): AutoRouterRow[] =>
  deployments.map(toAutoRouterRow);
