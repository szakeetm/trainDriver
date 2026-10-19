// Register before the game scripts so loading and startup failures are visible
// on phones without a connected browser console.
window.addEventListener("error", (event) => {
  const script = event.target;
  const scriptFailed = script instanceof HTMLScriptElement;
  if (!scriptFailed && (!event.filename || !event.message)) return;
  const source = scriptFailed ? script.src : event.filename;
  const url = new URL(source, location.href);
  if (url.origin !== location.origin) return;
  console.error("[game]", scriptFailed ? `Could not load ${url.pathname}` : event.error || event.message);
  let notice = document.getElementById("gameError");
  if (notice) return;
  notice = document.createElement("div");
  notice.id = "gameError";
  notice.className = "game-error";
  notice.setAttribute("role", "alert");
  const title = document.createElement("strong");
  title.textContent = "The game could not continue.";
  const detail = document.createElement("p");
  detail.textContent = scriptFailed
    ? `Could not load ${url.pathname.split("/").pop()}. Please reload the page.`
    : `${event.message} (${url.pathname.split("/").pop()}:${event.lineno})`;
  notice.append(title, detail);
  document.querySelector(".canvas-wrap").appendChild(notice);
}, true);
