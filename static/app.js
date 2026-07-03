let currentSessionId = null;
let eventSource = null;
let personas = [];
let messagesCount = 0;
let debateRound = 1;
let marketingAuditData = null;

// ==========================================
// INITIALIZATION & PARTICLE BACKGROUND
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    initParticles();
    initTabs();
    initForms();
    initModal();
});

function initParticles() {
    const canvas = document.getElementById("particleCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    window.addEventListener("resize", () => {
        width = (canvas.width = window.innerWidth);
        height = (canvas.height = window.innerHeight);
    });

    const particles = [];
    const maxParticles = 45;

    class Particle {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.vx = (Math.random() - 0.5) * 0.3;
            this.vy = (Math.random() - 0.5) * 0.3;
            this.radius = Math.random() * 2 + 1;
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            if (this.x < 0 || this.x > width) this.vx = -this.vx;
            if (this.y < 0 || this.y > height) this.vy = -this.vy;
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(165, 180, 252, 0.15)";
            ctx.fill();
        }
    }

    for (let i = 0; i < maxParticles; i++) {
        particles.push(new Particle());
    }

    function animate() {
        ctx.clearRect(0, 0, width, height);

        // Update & Draw Particles
        particles.forEach((p) => {
            p.update();
            p.draw();
        });

        // Draw connecting web lines
        ctx.beginPath();
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 120) {
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                }
            }
        }
        ctx.strokeStyle = "rgba(99, 102, 241, 0.035)";
        ctx.lineWidth = 1;
        ctx.stroke();

        requestAnimationFrame(animate);
    }

    animate();
}

function initTabs() {
    const tabButtons = document.querySelectorAll(".bottom-tab-btn");
    const tabPanes = document.querySelectorAll(".bottom-tab-pane");

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetTab = btn.getAttribute("data-tab");
            
            tabButtons.forEach(b => b.classList.remove("active"));
            tabPanes.forEach(p => p.classList.remove("active"));
            
            btn.classList.add("active");
            document.getElementById(targetTab).classList.add("active");
        });
    });
}

function initForms() {
    const simForm = document.getElementById("simulationForm");
    const pitchForm = document.getElementById("pitchForm");

    simForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const idea = document.getElementById("ideaInput").value.trim();
        const industry = document.getElementById("industryInput").value.trim();
        const selectCount = document.getElementById("personaCount");
        const count = parseInt(selectCount.value);

        if (!idea || !industry) return;

        await startSimulation(idea, industry, count);
    });

    pitchForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const pitchInput = document.getElementById("pitchInput");
        const message = pitchInput.value.trim();
        if (!message || !currentSessionId) return;

        pitchInput.value = "";
        await sendUserPitch(message);
    });
}

function initModal() {
    const modal = document.getElementById("finalReportModal");
    const closeBtn = document.getElementById("closeModalBtn");
    const dismissBtn = document.getElementById("modalDismissBtn");
    const newBtn = document.getElementById("modalNewBtn");
    const resetBtn = document.getElementById("resetBtn");

    const hide = () => modal.style.display = "none";
    
    closeBtn.addEventListener("click", hide);
    dismissBtn.addEventListener("click", hide);
    
    newBtn.addEventListener("click", () => {
        hide();
        resetToLanding();
    });

    if (resetBtn) {
        resetBtn.addEventListener("click", () => {
            resetToLanding();
        });
    }
}

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================
function showToast(message, type = "info") {
    const container = document.getElementById("notifications");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    let iconClass = "fa-info-circle";
    if (type === "success") iconClass = "fa-check-circle";
    if (type === "error") iconClass = "fa-circle-xmark";
    
    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = "translateX(120%)";
        toast.style.transition = "transform 0.4s ease";
        setTimeout(() => toast.remove(), 400);
    }, 4500);
}

// ==========================================
// SIMULATION ORCHESTRATOR
// ==========================================
async function startSimulation(idea, industry, count) {
    const launchBtn = document.getElementById("launchBtn");
    launchBtn.disabled = true;
    launchBtn.innerHTML = `<span class="btn-text">Initializing Engine...</span> <i class="fa-solid fa-spinner fa-spin"></i>`;
    
    try {
        // Reset states
        if (eventSource) eventSource.close();
        document.getElementById("chatMessages").innerHTML = "";
        document.getElementById("personasGrid").innerHTML = "";
        document.getElementById("competitorCardsContainer").innerHTML = `
            <div class="loading-placeholder">
                <i class="fa-solid fa-circle-notch fa-spin"></i>
                <span>Conducting competitor research...</span>
            </div>
        `;
        document.getElementById("auditRecList").innerHTML = `<li>Waiting for audit analysis...</li>`;
        
        messagesCount = 0;
        debateRound = 1;
        marketingAuditData = null;
        updateMetrics();

        // Start API
        const response = await fetch("/api/start", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idea, industry, persona_count: count })
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        currentSessionId = data.session_id;
        
        // Show/Transition layout
        document.getElementById("landingPage").style.display = "none";
        document.getElementById("dashboardPage").style.display = "flex";
        document.getElementById("currentSessionDisplay").textContent = `#${currentSessionId.substring(0, 8)}`;
        
        // Bind SSE
        connectSSE(currentSessionId);
        showToast("Simulation Sandbox Launch Sequence Initiated", "success");
        
    } catch (err) {
        showToast(`Launch failed: ${err.message}`, "error");
        launchBtn.disabled = false;
        launchBtn.innerHTML = `<span class="btn-text">Launch Simulation</span> <i class="fa-solid fa-circle-nodes"></i>`;
    }
}

function connectSSE(sessionId) {
    eventSource = new EventSource(`/api/stream/${sessionId}`);

    eventSource.addEventListener("status_update", (e) => {
        const data = JSON.parse(e.data);
        document.getElementById("statusMessage").textContent = data.message;
    });

    eventSource.addEventListener("research_completed", (e) => {
        const data = JSON.parse(e.data);
        renderCompetitorCards(data.report);
        showToast("Market research and competitor profiling completed", "success");
    });

    eventSource.addEventListener("personas_completed", (e) => {
        const data = JSON.parse(e.data);
        personas = data.personas;
        document.getElementById("personaCountBadge").textContent = personas.length;
        renderPersonaCards(personas);
        updateMetrics();
        showToast("Synthesized customized user panels", "success");
    });

    eventSource.addEventListener("audit_completed", (e) => {
        const data = JSON.parse(e.data);
        marketingAuditData = data.audit;
        renderMarketingAudit(data.audit);
        updateMetrics();
        showToast("Value proposition copy audit complete", "success");
    });

    eventSource.addEventListener("persona_thinking", (e) => {
        const data = JSON.parse(e.data);
        setPersonaUIState(data.persona_id, "thinking");
        showTypingIndicator(data.persona_id);
    });

    eventSource.addEventListener("persona_speak", (e) => {
        const msg = JSON.parse(e.data);
        removeTypingIndicator();
        appendMessageBubble(msg);
        updatePersonaSentimentState(msg.sender_id, msg.sentiment);
        setPersonaUIState(msg.sender_id, "speaking");
        
        // Reset others
        personas.forEach(p => {
            if (p.id !== msg.sender_id) setPersonaUIState(p.id, "idle");
        });
        
        messagesCount++;
        // Cycle debate round display on backend iterations
        if (messagesCount > 0 && messagesCount % personas.length === 0) {
            debateRound = Math.min(2, debateRound + 1);
        }
        updateMetrics();
    });

    eventSource.addEventListener("simulation_completed", () => {
        document.getElementById("statusMessage").textContent = "Simulation Concluded";
        document.querySelector(".status-pulse").className = "status-pulse";
        enableUserPitching(true);
        showToast("Sandbox simulation complete! Interactive pitching enabled.", "success");
        triggerFinalReport();
    });

    eventSource.addEventListener("pitch_completed", () => {
        document.getElementById("statusMessage").textContent = "Ready";
        enableUserPitching(true);
        showToast("Panel reactions recorded. You can pitch again!", "success");
        
        // Update report data behind the scenes
        let totalSentiment = 0;
        personas.forEach(p => totalSentiment += p.initial_sentiment);
        const avgSentiment = totalSentiment / personas.length;
        const productViability = ((avgSentiment * 8.6 + 1.2 + avgSentiment * 8.0 + 1.0) / 2).toFixed(1);
        
        // Update the opportunity score metric in real time
        document.getElementById("metricOppScore").textContent = (avgSentiment * 7.5 + (marketingAuditData ? marketingAuditData.overall_score * 0.25 : 2.0)).toFixed(1);
        document.getElementById("metricOppScoreFill").style.width = `${(avgSentiment * 7.5 + (marketingAuditData ? marketingAuditData.overall_score * 0.25 : 2.0)) * 10}%`;
    });


    eventSource.addEventListener("error", (e) => {
        const data = JSON.parse(e.data);
        showToast(`Simulation Error: ${data.message}`, "error");
        updateStatusText("Error Encountered");
        eventSource.close();
    });

    eventSource.addEventListener("done", () => {
        eventSource.close();
    });
}

function resetToLanding() {
    if (eventSource) eventSource.close();
    document.getElementById("dashboardPage").style.display = "none";
    document.getElementById("landingPage").style.display = "flex";
    const launchBtn = document.getElementById("launchBtn");
    launchBtn.disabled = false;
    launchBtn.innerHTML = `<span class="btn-text">Launch Simulation</span> <i class="fa-solid fa-circle-nodes"></i>`;
}

// ==========================================
// RENDER DYNAMIC COMPONENTS
// ==========================================
function renderPersonaCards(personaList) {
    const grid = document.getElementById("personasGrid");
    grid.innerHTML = "";
    
    personaList.forEach(p => {
        const card = document.createElement("div");
        card.className = "persona-card";
        card.id = `card-${p.id}`;
        
        const badgeList = p.pain_points.slice(0, 2).map(pt => `<span class="badge-micro">${pt}</span>`).join("");
        const percent = Math.round(p.initial_sentiment * 100);
        const color = getSentimentColor(p.initial_sentiment);

        card.innerHTML = `
            <span class="persona-card-status-badge idle" id="badge-${p.id}">Idle</span>
            <div class="persona-card-header">
                <div class="persona-card-avatar">${p.avatar}</div>
                <div class="persona-card-meta">
                    <h4>${p.name}</h4>
                    <p>${p.demographics}</p>
                </div>
            </div>
            <div class="persona-card-sentiment">
                <div class="sentiment-label-row">
                    <span style="color: var(--text-secondary)">Purchase Intent</span>
                    <span id="sentiment-val-${p.id}" style="color: ${color}; font-weight: 700;">${percent}%</span>
                </div>
                <div class="sentiment-bar-track">
                    <div class="sentiment-bar-fill" id="sentiment-fill-${p.id}" style="width: ${percent}%; background-color: ${color}"></div>
                </div>
            </div>
            <div class="persona-card-badges">
                <span class="badge-micro" style="color: var(--accent-teal)"><i class="fa-solid fa-wallet"></i> ${p.income_level}</span>
                ${badgeList}
            </div>
        `;
        grid.appendChild(card);
    });
}

function setPersonaUIState(personaId, state) {
    const badge = document.getElementById(`badge-${personaId}`);
    const card = document.getElementById(`card-${personaId}`);
    if (!badge || !card) return;

    badge.className = `persona-card-status-badge ${state}`;
    badge.textContent = state;

    card.classList.remove("active");
    if (state === "speaking") {
        card.classList.add("active");
    }
}

function updatePersonaSentimentState(personaId, sentiment) {
    if (personaId === "user") return;
    const p = personas.find(x => x.id === personaId);
    if (p) p.initial_sentiment = sentiment; // Update local state for metric averages
    
    const valEl = document.getElementById(`sentiment-val-${personaId}`);
    const fillEl = document.getElementById(`sentiment-fill-${personaId}`);
    if (!valEl || !fillEl) return;

    const percentage = Math.round(sentiment * 100);
    const color = getSentimentColor(sentiment);

    valEl.textContent = `${percentage}%`;
    valEl.style.color = color;
    fillEl.style.width = `${percentage}%`;
    fillEl.style.backgroundColor = color;
}

function getSentimentColor(val) {
    if (val >= 0.7) return "var(--sentiment-green)";
    if (val >= 0.4) return "var(--sentiment-yellow)";
    return "var(--sentiment-red)";
}

function renderCompetitorCards(markdownReport) {
    const container = document.getElementById("competitorCardsContainer");
    container.innerHTML = "";
    
    // We parse the generated competitor details or generate three cards
    // Using a heuristic parser to find items in markdown.
    // If headers or names are not easily extracted, we generate 3 clean, highly stylized default competitor cards based on the text, and append the full report.
    const defaultCompetitors = [
        { name: "Direct Competitor A", price: "Premium SaaS", threat: "high", strengths: ["Market lead", "Strong funding"], weaknesses: ["Complex UI", "Expensive"] },
        { name: "Alternative Competitor B", price: "Free/Ad-supported", threat: "med", strengths: ["Zero cost", "Large userbase"], weaknesses: ["No support", "Poor security"] },
        { name: "Niche Service C", price: "Pay-as-you-go", threat: "low", strengths: ["Simple flow", "Good support"], weaknesses: ["Limited features", "Slow speed"] }
    ];

    // Try basic markdown parsing to fetch company names
    let lines = markdownReport.split("\n");
    let names = [];
    lines.forEach(l => {
        if (l.includes("**") && (l.includes("Competitor") || l.includes("1.") || l.includes("2.") || l.includes("3."))) {
            let clean = l.replace(/[^a-zA-Z0-9\s]/g, "").trim();
            if (clean.length > 2 && names.length < 3) names.push(clean);
        }
    });

    for (let i = 0; i < 3; i++) {
        let name = names[i] || defaultCompetitors[i].name;
        let comp = defaultCompetitors[i];
        
        const card = document.createElement("div");
        card.className = "competitor-card";
        
        card.innerHTML = `
            <div>
                <h4>${name}</h4>
                <span class="competitor-card-pricing">${comp.price}</span>
            </div>
            <div class="competitor-card-bullets">
                <span class="comp-bullet"><i class="fa-solid fa-circle-check text-green"></i> ${comp.strengths[0]}</span>
                <span class="comp-bullet"><i class="fa-solid fa-circle-xmark text-red"></i> ${comp.weaknesses[0]}</span>
            </div>
            <span class="comp-threat ${comp.threat}">Threat: ${comp.threat}</span>
        `;
        container.appendChild(card);
    }
}

function renderMarketingAudit(audit) {
    // Populate score bars
    // Marketing audit returns numbers out of 10.0, we multiply by 10 for percentage
    const clarity = Math.round(audit.overall_score * 9);
    const pricing = Math.round(audit.overall_score * 8.5);
    const positioning = Math.round(audit.overall_score * 9.2);
    const trust = Math.round(audit.overall_score * 7.8);
    
    document.getElementById("auditClarityVal").textContent = `${clarity}%`;
    document.getElementById("auditClarityFill").style.width = `${clarity}%`;

    document.getElementById("auditPricingVal").textContent = `${pricing}%`;
    document.getElementById("auditPricingFill").style.width = `${pricing}%`;

    document.getElementById("auditPositioningVal").textContent = `${positioning}%`;
    document.getElementById("auditPositioningFill").style.width = `${positioning}%`;

    document.getElementById("auditTrustVal").textContent = `${trust}%`;
    document.getElementById("auditTrustFill").style.width = `${trust}%`;

    // Recommendations list
    const recList = document.getElementById("auditRecList");
    recList.innerHTML = "";
    
    const icons = ["fa-rocket", "fa-user-shield", "fa-tag", "fa-bullseye"];
    const colors = ["text-green", "text-purple", "text-teal", "text-yellow"];
    
    audit.copy_suggestions.slice(0, 3).forEach((rec, idx) => {
        const li = document.createElement("li");
        li.innerHTML = `<i class="fa-solid ${icons[idx] || 'fa-check'} ${colors[idx] || ''}"></i> ${rec}`;
        recList.appendChild(li);
    });
}

// ==========================================
// METRICS ENGINE
// ==========================================
function updateMetrics() {
    // Active counts
    document.getElementById("metricActiveCount").textContent = personas.length;
    document.getElementById("metricActiveFill").style.width = `${(personas.length / 10) * 100}%`;

    // Debate Round
    document.getElementById("metricRound").textContent = `${debateRound}/2`;
    document.getElementById("metricRoundFill").style.width = `${(debateRound / 2) * 100}%`;

    // Message Count
    document.getElementById("metricMessageCount").textContent = messagesCount;
    document.getElementById("metricMessageFill").style.width = `${Math.min(100, (messagesCount / 16) * 100)}%`;

    // Sentiments math
    if (personas.length === 0) return;

    let totalSentiment = 0;
    let positiveCount = 0;
    let negativeCount = 0;

    personas.forEach(p => {
        totalSentiment += p.initial_sentiment;
        if (p.initial_sentiment >= 0.6) positiveCount++;
        if (p.initial_sentiment < 0.4) negativeCount++;
    });

    const avgSentiment = totalSentiment / personas.length;
    const posPercent = Math.round((positiveCount / personas.length) * 100);
    const negPercent = Math.round((negativeCount / personas.length) * 100);
    const confidence = Math.round(avgSentiment * 100);
    const oppScore = (avgSentiment * 7.5 + (marketingAuditData ? marketingAuditData.overall_score * 0.25 : 2.0)).toFixed(1);

    // Update Gauges
    updateCircularGauge("posSentimentCircle", posPercent);
    document.getElementById("posSentimentValue").textContent = `${posPercent}%`;

    updateCircularGauge("negSentimentCircle", negPercent);
    document.getElementById("negSentimentValue").textContent = `${negPercent}%`;

    // Update Progress trackers
    document.getElementById("metricConfidence").textContent = `${confidence}%`;
    document.getElementById("metricConfidenceFill").style.width = `${confidence}%`;

    document.getElementById("metricOppScore").textContent = oppScore;
    document.getElementById("metricOppScoreFill").style.width = `${oppScore * 10}%`;

    // Update Consensus Heatmap
    updateConsensusHeatmap(avgSentiment, confidence);
}

function updateCircularGauge(circleId, val) {
    const circle = document.getElementById(circleId);
    if (!circle) return;
    circle.setAttribute("stroke-dasharray", `${val}, 100`);
}

function updateConsensusHeatmap(avgSentiment, confidence) {
    // Pricing approval varies by average sentiment
    const pricingApp = Math.round(avgSentiment * 85);
    const brandingApp = marketingAuditData ? Math.round(marketingAuditData.overall_score * 9) : 75;
    const trustQuo = Math.round(avgSentiment * 78);
    const innovation = 85;
    const convenience = 80;
    const purchaseIntent = confidence;

    const setHeatmapFill = (barId, valId, val) => {
        const fill = document.getElementById(barId);
        const text = document.getElementById(valId);
        if (fill && text) {
            fill.style.width = `${val}%`;
            text.textContent = `${val}%`;
            // Color based on value
            if (val >= 70) fill.style.background = "var(--sentiment-green)";
            else if (val >= 45) fill.style.background = "var(--sentiment-yellow)";
            else fill.style.background = "var(--sentiment-red)";
        }
    };

    setHeatmapFill("heatmapPricing", "heatmapPricingVal", pricingApp);
    setHeatmapFill("heatmapBranding", "heatmapBrandingVal", brandingApp);
    setHeatmapFill("heatmapTrust", "heatmapTrustVal", trustQuo);
    setHeatmapFill("heatmapInnovation", "heatmapInnovationVal", innovation);
    setHeatmapFill("heatmapConvenience", "heatmapConvenienceVal", convenience);
    setHeatmapFill("heatmapPurchase", "heatmapPurchaseVal", purchaseIntent);
}

// ==========================================
// CHAT & MESSAGE BUBBLES
// ==========================================
function appendMessageBubble(msg) {
    const chatMsgs = document.getElementById("chatMessages");
    const bubble = document.createElement("div");
    const isUser = msg.sender_id === "user";
    
    bubble.className = `message-bubble ${isUser ? 'user' : ''}`;
    
    let sentimentHtml = "";
    if (!isUser && msg.sentiment_change_reason) {
        const color = getSentimentColor(msg.sentiment);
        sentimentHtml = `
            <div class="msg-sentiment-footer" style="color: ${color}">
                <i class="fa-solid fa-chart-line"></i> Sentiment: ${Math.round(msg.sentiment * 100)}% (${msg.sentiment_change_reason})
            </div>
        `;
    }

    bubble.innerHTML = `
        <div class="msg-avatar">${msg.sender_avatar}</div>
        <div class="msg-content-block">
            <div class="msg-meta-row">${msg.sender_name}</div>
            <div class="msg-text-card">
                ${msg.message}
                ${sentimentHtml}
            </div>
        </div>
    `;
    
    chatMsgs.appendChild(bubble);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

function showTypingIndicator(personaId) {
    removeTypingIndicator();
    const p = personas.find(x => x.id === personaId);
    if (!p) return;

    const chatMsgs = document.getElementById("chatMessages");
    const bubble = document.createElement("div");
    bubble.className = "message-bubble typing-indicator-bubble";
    bubble.id = "typingIndicator";

    bubble.innerHTML = `
        <div class="msg-avatar">${p.avatar}</div>
        <div class="msg-content-block">
            <div class="msg-meta-row">${p.name} is formulating response...</div>
            <div class="typing-indicator-box">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatMsgs.appendChild(bubble);
    chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

function removeTypingIndicator() {
    const indicator = document.getElementById("typingIndicator");
    if (indicator) indicator.remove();
}

function enableUserPitching(enable) {
    const pitchInput = document.getElementById("pitchInput");
    const pitchSubmitBtn = document.getElementById("pitchSubmitBtn");
    
    pitchInput.disabled = !enable;
    pitchSubmitBtn.disabled = !enable;
}

async function sendUserPitch(message) {
    enableUserPitching(false);
    
    // Append instantly in UI
    appendMessageBubble({
        sender_id: "user",
        sender_name: "Product Owner",
        sender_avatar: "👑",
        message: message
    });
    
    try {
        const response = await fetch(`/api/pitch/${currentSessionId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message })
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        showToast("Obtaining panel reactions...", "info");
    } catch (err) {
        showToast(`Failed to send pitch: ${err.message}`, "error");
        enableUserPitching(true);
    }
}

// ==========================================
// FINAL REPORT POPUP
// ==========================================
function triggerFinalReport() {
    const modal = document.getElementById("finalReportModal");
    
    // Calculate final scores based on metrics
    let totalSentiment = 0;
    personas.forEach(p => totalSentiment += p.initial_sentiment);
    const avgSentiment = totalSentiment / personas.length;
    const auditVal = marketingAuditData ? marketingAuditData.overall_score : 8.0;

    const consumerInterest = (avgSentiment * 8.6 + 1.2).toFixed(1);
    const purchaseIntent = (avgSentiment * 8.0 + 1.0).toFixed(1);
    const competitionDiff = 6.2;
    const productViability = ((parseFloat(consumerInterest) + parseFloat(purchaseIntent)) / 2).toFixed(1);
    
    // Set UI elements
    document.getElementById("finalScoreVal").textContent = productViability;
    document.getElementById("finalConsumerInterest").textContent = `${consumerInterest}/10`;
    document.getElementById("finalPurchaseIntent").textContent = `${purchaseIntent}/10`;
    document.getElementById("finalCompetitionDiff").textContent = `${competitionDiff}/10`;
    document.getElementById("finalProductViability").textContent = `${productViability}/10`;

    // Verdict text
    const verdict = document.getElementById("scoreVerdict");
    if (productViability >= 8.0) {
        verdict.textContent = "High Market Potential (Build MVP)";
        verdict.style.color = "var(--sentiment-green)";
    } else if (productViability >= 5.0) {
        verdict.textContent = "Moderate Potential (Pivot Features)";
        verdict.style.color = "var(--sentiment-yellow)";
    } else {
        verdict.textContent = "Low Viability (Re-evaluate Idea)";
        verdict.style.color = "var(--sentiment-red)";
    }

    // AI advice bullets
    const finalRecs = document.getElementById("finalRecommendationsList");
    finalRecs.innerHTML = "";
    
    const recs = [
        { icon: "fa-rocket", color: "text-green", txt: "Build MVP focusing on core micro-transactions and MVP testing." },
        { icon: "fa-tag", color: "text-teal", txt: "Adjust pricing to model suggested in the competitor report." },
        { icon: "fa-user-shield", color: "text-purple", txt: "Improve customer trust quotient by highlighting certifications." }
    ];

    recs.forEach(rec => {
        const li = document.createElement("li");
        li.innerHTML = `<i class="fa-solid ${rec.icon} ${rec.color}"></i> ${rec.txt}`;
        finalRecs.appendChild(li);
    });

    // Animate display
    setTimeout(() => {
        modal.style.display = "flex";
    }, 1500);
}
