const form = document.querySelector("#help-form");
const button = form.querySelector("button");
const status = document.querySelector("#form-status");
let pending = false;

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (pending || !form.reportValidity()) return;
  pending = true;
  const label = button.textContent;
  const disabled = button.disabled;
  const fields = new FormData(form);
  button.disabled = true;
  button.textContent = "Sending…";
  status.textContent = "Sending…";
  form.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(form.action, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(fields)), signal: AbortSignal.timeout(18000),
    });
    if (!response.ok || (await response.json()).ok !== true) throw new Error();
    if ([...fields].every(([name, value]) => form.elements.namedItem(name).value === value)) form.reset();
    status.textContent = "Message received. Thanks for getting in touch.";
  } catch {
    status.textContent = "We couldn’t confirm receipt. Your message is still here.";
  } finally {
    pending = false;
    button.textContent = label;
    button.disabled = disabled;
    form.removeAttribute("aria-busy");
  }
});
