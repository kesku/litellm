import { renderWithProviders, screen, within } from "../../../../../tests/test-utils";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import GeneralSettings from "./general_settings";
import { deleteConfigFieldSetting, getGeneralSettingsCall, updateConfigFieldSetting } from "@/components/networking";

vi.mock("@/components/networking", () => ({
  getGeneralSettingsCall: vi.fn(),
  updateConfigFieldSetting: vi.fn().mockResolvedValue({}),
  deleteConfigFieldSetting: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/components/router_settings", () => ({ default: () => null }));
vi.mock("@/components/Settings/RouterSettings/Fallbacks/Fallbacks", () => ({ default: () => null }));
vi.mock("@/components/routing_groups", () => ({ default: () => null }));
vi.mock("./AutoRouters/AutoRoutersPanel", () => ({
  AutoRoutersPanel: ({ canModify }: { canModify: boolean }) => (
    <div data-testid="auto-routers-panel">canModify:{String(canModify)}</div>
  ),
}));

const { useTeams } = vi.hoisted(() => ({ useTeams: vi.fn(() => ({ data: [] })) }));
vi.mock("@/app/(dashboard)/hooks/teams/useTeams", () => ({ useTeams }));

const TEAM_ADMIN_TEAMS = [{ team_id: "t1", members_with_roles: [{ user_id: "team-admin", role: "admin" }] }];

// Mirrors the /config/list ordering: the two prompt-caching rows sit between the
// General-tab rows in the unfiltered response but are filtered out of the General
// tab's table, so any index-based lookup into the unfiltered array reads the wrong
// row for every field rendered after them.
const SETTINGS_FIXTURE = [
  {
    field_name: "budget_exceeded_throttle_percentage",
    field_type: "Float",
    field_value: null,
    field_description: "throttle fraction",
    stored_in_db: null,
    field_default_value: null,
  },
  {
    field_name: "enable_anthropic_prompt_caching",
    field_type: "Boolean",
    field_value: true,
    field_description: "prompt caching toggle",
    stored_in_db: true,
    field_tab: "prompt_caching",
    field_default_value: false,
  },
  {
    field_name: "anthropic_prompt_caching_ttl",
    field_type: "Select",
    field_value: "5m",
    field_description: "prompt caching ttl",
    stored_in_db: true,
    field_options: ["5m", "1h"],
    field_tab: "prompt_caching",
    field_default_value: null,
  },
  {
    field_name: "max_ui_session_budget",
    field_type: "Dollar",
    field_value: 7.5,
    field_description: "dashboard session budget",
    stored_in_db: true,
    field_default_value: 1.0,
  },
];

const settingsRow = async (fieldName: string) => {
  const cell = await screen.findByText(fieldName);
  const row = cell.closest("tr");
  expect(row).not.toBeNull();
  return row as HTMLElement;
};

describe("GeneralSettings General tab", () => {
  beforeEach(() => {
    vi.mocked(getGeneralSettingsCall).mockResolvedValue([...SETTINGS_FIXTURE.map((s) => ({ ...s }))]);
    vi.mocked(updateConfigFieldSetting).mockClear();
    vi.mocked(deleteConfigFieldSetting).mockClear();
  });

  it("updates max_ui_session_budget with its own value, not the value at its filtered index", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(screen.getByText("General"));
    const row = await settingsRow("max_ui_session_budget");

    await user.click(within(row).getByRole("button", { name: /update/i }));

    expect(updateConfigFieldSetting).toHaveBeenCalledWith("token", "max_ui_session_budget", 7.5);
  });

  it("reset shows the field's default value instead of an empty input", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin" userID="user" />);

    await user.click(screen.getByText("General"));
    const row = await settingsRow("max_ui_session_budget");
    expect(within(row).getByRole("spinbutton")).toHaveValue("7.50");

    const actionCell = row.querySelectorAll("td")[3];
    const resetIcon = actionCell.querySelector("svg");
    expect(resetIcon).not.toBeNull();
    await user.click(resetIcon as unknown as Element);

    expect(deleteConfigFieldSetting).toHaveBeenCalledWith("token", "max_ui_session_budget");
    expect(within(row).getByRole("spinbutton")).toHaveValue("1.00");
  });
});

// A team admin is not in all_admin_roles, so before this gating they lost the only supported UI
// path for creating a team-scoped auto router when the Add Model entry point was removed.
describe("GeneralSettings role gating", () => {
  beforeEach(() => {
    vi.mocked(getGeneralSettingsCall).mockResolvedValue([]);
    useTeams.mockReturnValue({ data: [] });
  });

  it("shows every tab to a proxy admin", async () => {
    renderWithProviders(<GeneralSettings accessToken="token" userRole="proxy_admin" userID="u" />);

    expect(await screen.findByRole("tab", { name: "Auto Router" })).toBeInTheDocument();
    ["Loadbalancing", "Routing Groups", "Fallbacks", "Prompt Caching", "General"].forEach((name) => {
      expect(screen.getByRole("tab", { name })).toBeInTheDocument();
    });
    expect(screen.getByTestId("auto-routers-panel")).toHaveTextContent("canModify:true");
  });

  it("shows a team admin only the Auto Router tab, and lets them write", async () => {
    useTeams.mockReturnValue({ data: TEAM_ADMIN_TEAMS });

    renderWithProviders(<GeneralSettings accessToken="token" userRole="Internal User" userID="team-admin" />);

    expect(await screen.findByRole("tab", { name: "Auto Router" })).toBeInTheDocument();
    ["Loadbalancing", "Routing Groups", "Fallbacks", "Prompt Caching", "General"].forEach((name) => {
      expect(screen.queryByRole("tab", { name })).not.toBeInTheDocument();
    });
    expect(screen.getByTestId("auto-routers-panel")).toHaveTextContent("canModify:true");
  });

  it("gives an admin viewer the tabs but no auto-router writes", async () => {
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Admin Viewer" userID="u" />);

    expect(await screen.findByRole("tab", { name: "Loadbalancing" })).toBeInTheDocument();
    expect(screen.getByTestId("auto-routers-panel")).toHaveTextContent("canModify:false");
  });

  it("gives a plain internal user no write access", async () => {
    renderWithProviders(<GeneralSettings accessToken="token" userRole="Internal User" userID="nobody" />);

    expect(await screen.findByTestId("auto-routers-panel")).toHaveTextContent("canModify:false");
  });
});
