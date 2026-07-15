document.documentElement.classList.add("js");

const header = document.querySelector("[data-header]");
const menuButton = document.querySelector(".menu-button");
const navigation = document.querySelector(".site-header nav");

// Gentle scroll reveals. The hidden state only exists under html.js, so the
// page stays fully readable if this script never runs.
const revealElements = document.querySelectorAll("[data-reveal]");
if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("revealed");
    revealObserver.unobserve(entry.target);
  }), { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add("revealed"));
}

function updateHeader() {
  header.classList.toggle("stuck", window.scrollY > 80);
}
updateHeader();
window.addEventListener("scroll", updateHeader, { passive: true });

menuButton.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  navigation.classList.toggle("open", !open);
});
navigation.addEventListener("click", () => {
  menuButton.setAttribute("aria-expanded", "false");
  navigation.classList.remove("open");
});

const brueVideo = document.querySelector(".brue-video");
const videoToggle = document.querySelector(".video-toggle");
if (brueVideo && videoToggle) {
  const syncVideoButton = () => {
    videoToggle.textContent = brueVideo.paused ? "Play" : "Pause";
    videoToggle.setAttribute("aria-label", `${brueVideo.paused ? "Play" : "Pause"} Brue Coffee video`);
  };
  videoToggle.addEventListener("click", () => {
    if (brueVideo.paused) brueVideo.play().catch(() => {});
    else brueVideo.pause();
    syncVideoButton();
  });
  brueVideo.addEventListener("play", syncVideoButton);
  brueVideo.addEventListener("pause", syncVideoButton);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) brueVideo.pause();
  syncVideoButton();
}

const slides = [
  { image: "assets/dedicated-desk.jpg", alt: "A dedicated desk at Spaces", title: "Focus", text: "Your own desk, personal storage and enough quiet to get properly into the work." },
  { image: "assets/meeting-room.jpg", alt: "Meeting room at Spaces", title: "Meet", text: "A proper table, a projector and a room where a call can become a useful conversation." },
  { image: "assets/small-room.jpg", alt: "A private team room at Spaces", title: "Settle in", text: "A furnished private room where your team can build a rhythm without building an office." }
];
let slideIndex = 0;
const experienceImage = document.querySelector("#experience-image");
const experienceCount = document.querySelector("#experience-count");
const experienceTitle = document.querySelector("#experience-title");
const experienceText = document.querySelector("#experience-text");
function showSlide(index) {
  slideIndex = (index + slides.length) % slides.length;
  const slide = slides[slideIndex];
  experienceImage.style.opacity = "0";
  window.setTimeout(() => {
    experienceImage.src = slide.image;
    experienceImage.alt = slide.alt;
    experienceCount.textContent = `${String(slideIndex + 1).padStart(2, "0")} / 03`;
    experienceTitle.textContent = slide.title;
    experienceText.textContent = slide.text;
    experienceImage.style.opacity = "1";
  }, 140);
  track("experience_slide", "gallery", { slide: slide.title });
}
document.querySelector("[data-slide-prev]").addEventListener("click", () => showSlide(slideIndex - 1));
document.querySelector("[data-slide-next]").addEventListener("click", () => showSlide(slideIndex + 1));

document.querySelectorAll(".membership-summary").forEach((summary) => {
  summary.addEventListener("click", () => {
    const expanded = summary.getAttribute("aria-expanded") === "true";
    summary.setAttribute("aria-expanded", String(!expanded));
    track("membership_expand", "plans", { membership: summary.querySelector("b").textContent });
  });
});

const amenityPhoto = document.querySelector("[data-amenity-photo]");
document.querySelectorAll("[data-amenity-image]").forEach((button) => {
  const selectAmenity = () => {
    document.querySelectorAll("[data-amenity-image]").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    amenityPhoto.style.opacity = "0";
    window.setTimeout(() => {
      amenityPhoto.src = button.dataset.amenityImage;
      amenityPhoto.alt = button.dataset.amenityAlt;
      amenityPhoto.style.opacity = "1";
    }, 120);
    track("amenity_view", "amenities", { amenity: button.textContent.trim() });
  };
  button.addEventListener("click", selectAmenity);
  button.addEventListener("mouseenter", selectAmenity);
});

const visitDialog = document.querySelector("#visit-dialog");
document.querySelectorAll("[data-open-visit]").forEach((button) => button.addEventListener("click", () => {
  visitDialog.showModal();
  document.body.classList.add("dialog-open");
}));
visitDialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
visitDialog.addEventListener("click", (event) => {
  if (event.target === visitDialog) visitDialog.close();
});
document.querySelector("#visit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const message = `Hi Spaces, I’d like to plan a visit.\n\nName: ${data.get("name")}\nPhone: ${data.get("phone")}\nPreferred day: ${data.get("day")}\nPeople: ${data.get("people")}\n\nI’d also like to try Brue Coffee and spend a few hours experiencing the workspace.`;
  track("visit_form_complete", "visit", { people: data.get("people"), day: data.get("day") });
  window.open(`https://wa.me/923173337756?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  visitDialog.close();
});

const analyticsSessionKey = "spaces-public-visit";
let analyticsSession = sessionStorage.getItem(analyticsSessionKey);
if (!analyticsSession) {
  analyticsSession = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(analyticsSessionKey, analyticsSession);
}
function deviceType() {
  if (window.innerWidth < 600) return "mobile";
  if (window.innerWidth < 1000) return "tablet";
  return "desktop";
}
function track(eventName, section = "", metadata = {}) {
  let referrerHost = "direct";
  try { referrerHost = document.referrer ? new URL(document.referrer).hostname : "direct"; } catch { referrerHost = "unknown"; }
  fetch("/api/track-visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventName, sessionId: analyticsSession, path: location.pathname, section, referrerHost, deviceType: deviceType(), metadata }), keepalive: true }).catch(() => {});
}
track("page_view", "home", Object.fromEntries(new URLSearchParams(location.search)));
document.querySelectorAll("[data-track]").forEach((element) => element.addEventListener("click", () => track(element.dataset.track, element.closest("[data-track-section]")?.dataset.trackSection || "")));
const seenSections = new Set();
const sectionObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
  const section = entry.target.dataset.trackSection;
  if (!entry.isIntersecting || seenSections.has(section)) return;
  seenSections.add(section);
  track("section_view", section);
  sectionObserver.unobserve(entry.target);
}), { threshold: 0.35 });
document.querySelectorAll("[data-track-section]").forEach((section) => sectionObserver.observe(section));
