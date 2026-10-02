// Copy buttons on the static method pages (methods/<id>/index.html).
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = document.querySelector(btn.dataset.copy);
    if (!target || !navigator.clipboard) return;
    const label = btn.textContent;
    navigator.clipboard.writeText(target.textContent).then(() => {
      btn.textContent = "✓ Copied";
      setTimeout(() => { btn.textContent = label; }, 1600);
    });
  });
});
