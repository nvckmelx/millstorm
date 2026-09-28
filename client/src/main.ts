import "@fontsource/rubik/500.css";
import "@fontsource/rubik/700.css";
import "@fontsource/rubik/800.css";
import "@fontsource/yeseva-one/400.css";
import "./style.css";
import type { LobbyState, Mode, Snapshot } from "@millstorm/shared";
import { OfflineSession, OnlineSession, type Session } from "./net";
import { mount, toast } from "./ui/dom";
import { MatchScreen } from "./ui/match";
import { OFFLINE_BUILD, loadingScreen, lobbyScreen, menuScreen, resultsScreen } from "./ui/screens";
import { ART_URL } from "./game/look";

const root = document.getElementById("app")!;
// The painted sky from the art pack sits behind every screen.
document.documentElement.style.setProperty("--sky-url", `url("${ART_URL}sky.jpg")`);

let session: Session | null = null;
let lobby: LobbyState | null = null;
let lastSnap: Snapshot | null = null;
let matchScreen: MatchScreen | null = null;

function inviteCode(): string | undefined {
  const m = location.pathname.match(/^\/p\/([A-Za-z0-9]{4})\/?$/);
  return m ? m[1].toUpperCase() : undefined;
}

function showMenu(): void {
  matchScreen?.destroy();
  matchScreen = null;
  session = null;
  lobby = null;
  lastSnap = null;
  mount(
    root,
    menuScreen(
      {
        party: (name) => connect(() => OnlineSession.createParty(name)),
        join: (code, name) => connect(() => OnlineSession.joinParty(code, name)),
        quickplay: (mode: Mode, name) => connect(() => OnlineSession.quickplay(mode, name)),
        offline: (mode: Mode, name) => attach(new OfflineSession({ name, mode })),
        tutorial: (name) => attach(new OfflineSession({ name, mode: 1, tutorial: true })),
      },
      OFFLINE_BUILD ? undefined : inviteCode(),
    ),
  );
}

async function connect(open: () => Promise<Session>): Promise<void> {
  try {
    attach(await open());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    toast(/ECONNREFUSED|Failed to fetch|NetworkError|network|offline/i.test(msg) || !msg ? "Сервер недоступен. Можно сыграть против ботов." : msg);
  }
}

function leave(): void {
  session?.leave();
  if (inviteCode()) history.replaceState(null, "", "/");
  showMenu();
}

function attach(s: Session): void {
  session = s;
  if (!s.offline && inviteCode()) history.replaceState(null, "", "/");
  s.on("lobby", (l) => {
    lobby = l;
    render();
  });
  s.on("snap", (snap) => {
    lastSnap = snap;
    if (matchScreen) matchScreen.update(snap);
    else if (lobby?.stage === "match") render();
  });
  s.on("error", (e) => toast(e.text));
  s.on("latency", (ms) => matchScreen?.latency(ms));
  s.on("closed", ({ reason }) => {
    if (session !== s) return;
    if (reason) toast(reason);
    showMenu();
  });
}

function render(): void {
  if (!session || !lobby) return;
  const stage = lobby.stage;
  if (stage !== "match" && matchScreen) {
    matchScreen.destroy();
    matchScreen = null;
  }
  switch (stage) {
    case "lobby":
      mount(root, lobbyScreen(lobby, session, leave));
      break;
    case "loading":
      lastSnap = null;
      mount(root, loadingScreen(lobby, session.tutorial));
      break;
    case "match":
      if (!matchScreen) {
        matchScreen = new MatchScreen(root, session, leave);
        if (lastSnap) matchScreen.update(lastSnap);
      }
      break;
    case "results":
      if (lastSnap?.result) mount(root, resultsScreen(lobby, lastSnap, session, leave, leave));
      break;
  }
}

async function boot(): Promise<void> {
  if (!OFFLINE_BUILD) {
    const again = await OnlineSession.tryReconnect();
    if (again) {
      attach(again);
      toast("Вернулись в матч", "info");
      return;
    }
  }
  showMenu();
}

void boot();
