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

const guide = document.querySelector("#space-guide");
const guideLauncher = document.querySelector(".guide-launcher");
const guideClose = document.querySelector(".guide-close");
const guideMessages = document.querySelector(".guide-messages");
const guideReplies = document.querySelector(".guide-replies");
const guideForm = document.querySelector(".guide-form");
const guideQuestion = document.querySelector("#guide-question");
let guideStarted = false;
let guideContext = "";

const guideChoices = {
  start: [
    { label: "I work on my own", value: "solo" },
    { label: "We are a team", value: "team" },
    { label: "I need a short stay", value: "short" },
    { label: "I need a meeting room", value: "meeting" }
  ],
  solo: [
    { label: "Lowest monthly rate", value: "flexible" },
    { label: "My own permanent desk", value: "dedicated" },
    { label: "More privacy", value: "personal" }
  ],
  team: [
    { label: "2–4 people", value: "team-small" },
    { label: "5–7 people", value: "team-medium" },
    { label: "8–11 people", value: "team-large" }
  ],
  short: [
    { label: "One day", value: "day" },
    { label: "One week", value: "week" },
    { label: "Just a few hours", value: "few-hours" }
  ],
  followup: [
    { label: "Compare all rates", value: "rates" },
    { label: "What is included?", value: "amenities" },
    { label: "Plan a visit", value: "visit" }
  ]
};

const recommendationLinks = {
  flexible: "Flexible Desk",
  dedicated: "Dedicated Desk",
  personal: "Personal Desk",
  "team-small": "a private setup for 2–4 people",
  "team-medium": "a private room for 5–7 people",
  "team-large": "a private room for 8–11 people",
  day: "a Day Pass",
  week: "a Weekly Pass",
  "few-hours": "a short visit",
  meeting: "the Meeting Room"
};

function guideWhatsApp(label, requirement) {
  const message = `Hi Spaces, your website guide helped me choose ${requirement}. Could you please confirm availability?`;
  return `<a class="guide-whatsapp" data-guide-whatsapp="${label}" href="https://wa.me/923173337756?text=${encodeURIComponent(message)}" target="_blank" rel="noreferrer">Check availability on WhatsApp →</a>`;
}

function addGuideMessage(content, sender = "bot") {
  const message = document.createElement("div");
  message.className = `guide-message ${sender}`;
  if (sender === "visitor") {
    message.textContent = content;
  } else {
    message.innerHTML = content;
  }
  guideMessages.appendChild(message);
  guideMessages.scrollTop = guideMessages.scrollHeight;
}

function setGuideReplies(items = []) {
  guideReplies.innerHTML = items.map((item) => `<button type="button" data-guide-choice="${item.value}">${item.label}</button>`).join("");
}

function answerGuideQuestion(question) {
  const value = question.toLowerCase();
  if (/flexible|hot desk|cheapest|lowest/.test(value)) {
    return `A <b>Flexible Desk is Rs 15,500/month</b>. It is the simplest monthly option when you do not need a permanently assigned desk.${guideWhatsApp("flexible", "a Flexible Desk")}`;
  }
  if (/dedicated|permanent desk|own desk/.test(value)) {
    return `A <b>Dedicated Desk is Rs 17,500/month</b>. You get your own permanent desk in the shared workspace, with personal storage.${guideWhatsApp("dedicated", "a Dedicated Desk")}`;
  }
  if (/personal|privacy|private desk/.test(value)) {
    return `A <b>Personal Desk is Rs 20,000/month</b>. It gives one person a more separated setup and extra privacy.${guideWhatsApp("personal", "a Personal Desk")}`;
  }
  if (/private room|team|office|room/.test(value) && !/meeting|conference/.test(value)) {
    return `Private rooms are available for teams of different sizes and start from <b>Rs 18,500 per person/month</b>. Tell me how many people are on your team and I’ll narrow it down.`;
  }
  if (/meeting|conference|hour/.test(value)) {
    return `The meeting and conference room is <b>Rs 1,500/hour</b>. It is suitable for client meetings, team discussions and presentations.${guideWhatsApp("meeting", "the Meeting Room")}`;
  }
  if (/day pass|one day|daily/.test(value)) {
    return `A <b>Day Pass is Rs 1,500 per person</b> and is valid for the day.${guideWhatsApp("day", "a Day Pass")}`;
  }
  if (/week|weekly/.test(value)) {
    return `A <b>Weekly Pass is Rs 5,000 per person</b>. It is useful when you need a proper workspace for a short project or visit.${guideWhatsApp("week", "a Weekly Pass")}`;
  }
  if (/price|rate|cost|plans|membership/.test(value)) {
    return `<b>Monthly:</b> Flexible Desk Rs 15,500 · Dedicated Desk Rs 17,500 · Personal Desk Rs 20,000 · Private rooms from Rs 18,500/person.<br><br><b>Short stays:</b> Day Pass Rs 1,500 · Weekly Pass Rs 5,000 · Meeting Room Rs 1,500/hour.`;
  }
  if (/coffee|brue|trial|try|free|visit/.test(value)) {
    return `You are welcome to grab a coffee from Brue at reception and spend your first few hours working from Spaces on us. It is an easy way to see how the place feels before choosing.${guideWhatsApp("visit", "a first visit to Spaces")}`;
  }
  if (/amenit|internet|wifi|power|backup|cafeteria|include/.test(value)) {
    return `Memberships include reliable internet, backup power and reception support, with access to shared facilities. Spaces also has a cafeteria, meeting facilities and Brue Coffee at reception.`;
  }
  if (/where|location|address|map|federal/.test(value)) {
    return `Spaces is at <b>Mezzanine Floor, C-10, Block 4, Federal B Area, Karachi</b>. Look for the Brue & Spaces entrance.${guideWhatsApp("location", "directions and a visit")}`;
  }
  if (/open|timing|hours/.test(value)) {
    return `Opening arrangements can vary, so WhatsApp Spaces for today’s timing and we’ll confirm it for you.${guideWhatsApp("hours", "today’s opening hours")}`;
  }
  return `I can help with plan rates, desk privacy, team rooms, short passes, amenities, meeting-room bookings or planning a visit. Choose a starting point below.`;
}

function handleGuideChoice(value, label) {
  addGuideMessage(label, "visitor");
  track("guide_answer", "guide", { answer: value });
  guideContext = value;
  if (value === "solo") {
    addGuideMessage("Good. How much privacy and permanence would you like from your desk?");
    setGuideReplies(guideChoices.solo);
    return;
  }
  if (value === "team") {
    addGuideMessage("How many people need to work together?");
    setGuideReplies(guideChoices.team);
    return;
  }
  if (value === "short") {
    addGuideMessage("How long do you expect to stay?");
    setGuideReplies(guideChoices.short);
    return;
  }
  if (value === "rates") {
    addGuideMessage(answerGuideQuestion("compare all plan rates"));
    setGuideReplies(guideChoices.start);
    return;
  }
  if (value === "amenities") {
    addGuideMessage(answerGuideQuestion("what amenities are included"));
    setGuideReplies(guideChoices.followup.filter((item) => item.value !== "amenities"));
    return;
  }
  if (value === "visit") {
    addGuideMessage(answerGuideQuestion("plan a free first visit"));
    setGuideReplies(guideChoices.start);
    return;
  }

  const answers = {
    flexible: "The Flexible Desk is the best-value monthly option at <b>Rs 15,500</b>. You use the shared workspace without keeping one permanently assigned desk.",
    dedicated: "I’d recommend a <b>Dedicated Desk at Rs 17,500/month</b>. It stays yours and includes personal storage.",
    personal: "I’d recommend a <b>Personal Desk at Rs 20,000/month</b> for a more separated one-person setup.",
    "team-small": "For 2–4 people, ask about the <b>cubicle or smaller private setup</b>. Private space starts from <b>Rs 18,500 per person/month</b>.",
    "team-medium": "A <b>5- or 7-person private room</b> should be the closest fit. Rooms start from <b>Rs 18,500 per person/month</b>.",
    "team-large": "The <b>11-person private room</b> is the closest fit for a larger team, subject to current availability. Rooms start from <b>Rs 18,500 per person/month</b>.",
    day: "A <b>Day Pass is Rs 1,500 per person</b> and is valid for the day.",
    week: "A <b>Weekly Pass is Rs 5,000 per person</b>, ideal for a short project or visit.",
    "few-hours": "Come by, grab a coffee from Brue and spend your first few hours working from Spaces on us. No membership decision needed.",
    meeting: "The <b>meeting room is Rs 1,500/hour</b>. Tell us the date, time and number of people when you enquire."
  };
  const requirement = recommendationLinks[value];
  addGuideMessage(`${answers[value]}${requirement ? guideWhatsApp(value, requirement) : ""}`);
  setGuideReplies(guideChoices.followup);
}

function openGuide() {
  guide.hidden = false;
  guideLauncher.setAttribute("aria-expanded", "true");
  document.body.classList.add("guide-open");
  if (!guideStarted) {
    addGuideMessage("Hi. I can help you choose a desk, private room or short stay. What brings you to Spaces?");
    setGuideReplies(guideChoices.start);
    guideStarted = true;
  }
  track("guide_open", "guide");
  window.setTimeout(() => guideQuestion.focus(), 80);
}

function closeGuide() {
  guide.hidden = true;
  guideLauncher.setAttribute("aria-expanded", "false");
  document.body.classList.remove("guide-open");
  guideLauncher.focus();
}

guideLauncher.addEventListener("click", () => guide.hidden ? openGuide() : closeGuide());
guideClose.addEventListener("click", closeGuide);
guideReplies.addEventListener("click", (event) => {
  const button = event.target.closest("[data-guide-choice]");
  if (!button) return;
  handleGuideChoice(button.dataset.guideChoice, button.textContent.trim());
});
guideMessages.addEventListener("click", (event) => {
  const link = event.target.closest("[data-guide-whatsapp]");
  if (link) track("guide_whatsapp", "guide", { recommendation: link.dataset.guideWhatsapp, context: guideContext });
});
guideForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const question = guideQuestion.value.trim();
  if (!question) return;
  addGuideMessage(question, "visitor");
  guideQuestion.value = "";
  addGuideMessage(answerGuideQuestion(question));
  setGuideReplies(guideChoices.followup);
  track("guide_answer", "guide", { answer: "typed" });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !guide.hidden) closeGuide();
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

// Plan carousel. The track is moved with a transform rather than container
// scrolling, so the position is exact and identical on every browser. Touch
// swipe is handled explicitly for the same reason.
const planViewport = document.querySelector("#planViewport");
const planTrack = document.querySelector("#planTrack");
if (planViewport && planTrack) {
  const planSlides = [...planTrack.querySelectorAll(".plan-slide")];
  const dotsHost = document.querySelector("#planDots");
  const prevButton = document.querySelector("[data-plan-prev]");
  const nextButton = document.querySelector("[data-plan-next]");
  let planIndex = 0;

  const dots = planSlides.map((slide, index) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", slide.getAttribute("aria-label") || `Plan ${index + 1}`);
    dot.addEventListener("click", () => goToPlan(index));
    dotsHost.appendChild(dot);
    return dot;
  });

  function goToPlan(index, announce = true) {
    planIndex = Math.max(0, Math.min(index, planSlides.length - 1));
    planTrack.style.transform = `translateX(-${planIndex * 100}%)`;
    dots.forEach((dot, i) => dot.setAttribute("aria-selected", String(i === planIndex)));
    planSlides.forEach((slide, i) => slide.setAttribute("aria-hidden", String(i !== planIndex)));
    prevButton.disabled = planIndex === 0;
    nextButton.disabled = planIndex === planSlides.length - 1;
    if (announce) {
      track("membership_expand", "plans", { membership: planSlides[planIndex].getAttribute("aria-label") });
    }
  }

  prevButton.addEventListener("click", () => goToPlan(planIndex - 1));
  nextButton.addEventListener("click", () => goToPlan(planIndex + 1));
  planViewport.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") { event.preventDefault(); goToPlan(planIndex - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); goToPlan(planIndex + 1); }
  });

  // Swipe: only act on a clear horizontal gesture so vertical page scrolling
  // is never hijacked.
  let touchStartX = 0;
  let touchStartY = 0;
  planViewport.addEventListener("touchstart", (event) => {
    touchStartX = event.changedTouches[0].clientX;
    touchStartY = event.changedTouches[0].clientY;
  }, { passive: true });
  planViewport.addEventListener("touchend", (event) => {
    const deltaX = event.changedTouches[0].clientX - touchStartX;
    const deltaY = event.changedTouches[0].clientY - touchStartY;
    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    goToPlan(planIndex + (deltaX < 0 ? 1 : -1));
  }, { passive: true });

  goToPlan(0, false);
}
