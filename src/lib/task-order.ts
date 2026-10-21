import type { useNavigate } from "@tanstack/react-router";

type Navigate = ReturnType<typeof useNavigate>;

export type TaskProgress = {
  signedIn: boolean;
  country: "Ghana" | "Nigeria" | null;
  linked: boolean;
  activated?: boolean;
};

/** Registration, country, SportyBet connection, activation, then packages. */
export function taskStep(link: TaskProgress): 1 | 2 | 3 | 4 | 5 {
  if (!link.signedIn) return 1;
  if (link.country !== "Ghana" && link.country !== "Nigeria") return 2;
  if (!link.linked) return 3;
  if (!link.activated) return 4;
  return 5;
}

export async function openTask(navigate: Navigate, link: TaskProgress, game?: "virtual") {
  if (game && typeof window !== "undefined")
    window.sessionStorage.setItem("games-hub-next-game", game);
  const step = taskStep(link);
  if (step === 1) {
    await navigate({ to: "/register" });
    return;
  }
  if (step === 2) {
    await navigate({ to: "/country" });
    return;
  }
  if (step === 3) {
    await navigate({ to: "/connect" });
    return;
  }
  if (step === 4) {
    await navigate({ to: "/activation" });
    return;
  }
  const virtual =
    game === "virtual" ||
    (typeof window !== "undefined" &&
      window.sessionStorage.getItem("games-hub-next-game") === "virtual");
  if (virtual) {
    if (typeof window !== "undefined") window.sessionStorage.removeItem("games-hub-next-game");
    await navigate({ to: "/virtual-packages" });
    return;
  }
  if (link.country === "Nigeria") {
    await navigate({ to: "/nigeria-pay" });
    return;
  }
  await navigate({ to: "/packages", search: { stay: 1 } });
}
