let vault = { accessToken: '', instanceUrl: '' };
let allObjects = [], allFlows = [], currentFields = [], selectedFields = new Set();

window.onload = () => autoConnect();

async function autoConnect() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return;
    const urlObj = new URL(tab.url);
    const orgBase = urlObj.hostname.split('.')[0].replace('.lightning', '');

    chrome.cookies.getAll({ name: "sid" }, (cookies) => {
        const apiCookie = cookies.find(c => c.domain.includes(orgBase) && c.domain.includes('.my.salesforce.com'));
        if (!apiCookie) return;
        vault.accessToken = apiCookie.value;
        vault.instanceUrl = `https://${apiCookie.domain.replace(/^\./, '')}`;
        document.getElementById('userBadge').style.display = 'flex';
        initialize();
    });
}

function initialize() { fetchUserInfo(); fetchAllObjects(); fetchAllFlows(); }

async function fetchUserInfo() {
    try {
        const res = await fetch(`${vault.instanceUrl}/services/oauth2/userinfo`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
        const data = await res.json();
        document.getElementById('userNameDisplay').textContent = data.name;
        document.getElementById('orgNameDisplay').textContent = new URL(vault.instanceUrl).hostname.split('.')[0].toUpperCase();
    } catch(e) {}
}

document.getElementById('btnRefresh').onclick = () => location.reload();

// --- FIELD FINDER ---
async function fetchAllObjects() {
    const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=SELECT+QualifiedApiName,Label,DurableId+FROM+EntityDefinition+WHERE+IsCustomizable=true`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
    const data = await res.json();
    allObjects = data.records.map(o => ({ name: o.QualifiedApiName, label: o.Label, id: o.DurableId }));
    const list = document.getElementById('objectList');
    allObjects.sort((a,b) => a.label.localeCompare(b.label)).forEach(o => {
        let opt = document.createElement('option'); opt.value = o.name; opt.textContent = o.label; list.appendChild(opt);
    });
}

document.getElementById('objInput').oninput = async (e) => {
    const obj = allObjects.find(o => o.name === e.target.value);
    if (!obj) return;
    const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=SELECT+QualifiedApiName,Label,DurableId+FROM+FieldDefinition+WHERE+EntityDefinitionId='${obj.name}'`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
    const data = await res.json();
    currentFields = data.records.map(f => ({ name: f.QualifiedApiName, label: f.Label, id: f.DurableId, objId: obj.id, objName: obj.name }));
    renderFields(currentFields);
    document.getElementById('fieldSearchInput').style.display = 'block';
};

document.getElementById('fieldSearchInput').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    renderFields(currentFields.filter(f => f.label.toLowerCase().includes(term) || f.name.toLowerCase().includes(term)));
};

// --- FIELD FINDER & SELECT ALL ---
document.getElementById('selectAll').onchange = (e) => {
    const checkboxes = document.querySelectorAll('.f-check');
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if(e.target.checked) selectedFields.add(cb.dataset.name);
        else selectedFields.delete(cb.dataset.name);
    });
    toggleInspectorBtn();
};

function toggleInspectorBtn() {
    const btn = document.getElementById('btnInspector');
    btn.style.display = selectedFields.size > 0 ? 'block' : 'none';
}

// --- FIELD FINDER (Label on top, API on bottom, Badge on side) ---
function renderFields(fields) {
    const resDiv = document.getElementById('results');
    resDiv.innerHTML = "";
    fields.sort((a,b) => a.label.localeCompare(b.label)).forEach(f => {
        const div = document.createElement('div');
        div.className = "card field-card";
        const isChecked = selectedFields.has(f.name) ? 'checked' : '';
        const isCustom = f.name.endsWith('__c') || f.name.endsWith('__pc');
        
        div.innerHTML = `
            <input type="checkbox" class="f-check" data-name="${f.name}" ${isChecked}>
            <div class="card-info" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; flex-direction: column;">
                    <a href="#" class="field-link">${f.label}</a>
                    <code style="margin: 2px 0 0 0; font-size: 11px; width: fit-content;">${f.name}</code>
                </div>
                ${isCustom ? '<span class="custom-badge">Custom</span>' : ''}
            </div>`;
        
        div.querySelector('.f-check').onchange = (e) => {
            if(e.target.checked) selectedFields.add(e.target.dataset.name);
            else selectedFields.delete(e.target.dataset.name);
            toggleInspectorBtn();
        };

        div.querySelector('.field-link').onclick = (e) => {
            e.preventDefault();
            const fId = f.id.includes('.') ? f.id.split('.')[1] : f.id;
            chrome.tabs.create({ url: `${vault.instanceUrl.replace('.my.salesforce.com', '.my.salesforce-setup.com')}/lightning/setup/ObjectManager/${f.objId}/FieldsAndRelationships/${fId}/view` });
        };
        resDiv.appendChild(div);
    });
}

// --- BEAUTIFIER ---
document.getElementById('formulaInput').oninput = (e) => {
    let raw = e.target.value;
    const out = document.getElementById('formulaOutput');
    const btn = document.getElementById('btnCopyFormula');
    
    if (!raw.trim()) { 
        out.style.display = 'none'; 
        btn.style.display = 'none';
        return; 
    }

    // 1. Clean input: remove non-breaking spaces and collapse extra whitespace
    let clean = raw.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, " ")
                   .replace(/\s+/g, ' ').trim();

    // 2. Formatting Step
    // We replace strings first to "protect" them from function highlighting
    let formatted = clean.replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
        return `<span class="syntax-string">${match}</span>`;
    });

    // 3. Highlight Functions - using a boundary \b to ensure we don't match inside tags
    formatted = formatted.replace(/\b([A-Z_$.0-9]+)\b(?=\s*\()/gi, (match) => {
        return `<span class="syntax-func">${match}</span>`;
    });

    // 4. Highlight Brackets
    formatted = formatted.replace(/[\(\)]/g, (match) => {
        return `<span class="syntax-bracket">${match}</span>`;
    });

    // 5. Spacing 
    // We look for a comma followed by a space and an IF function
    let finalHtml = formatted
        .replace(/,\s*(?=<span class="syntax-func">IF<\/span>)/gi, ',<br><br>')
        // Also break before the very last NULL or final closing arguments
        .replace(/\)\s*,\s*(?=NULL|TRUE|FALSE|<span class="syntax-string">)/gi, '),<br><br>');

    out.innerHTML = finalHtml;
    out.style.display = 'block';
    btn.style.display = 'block';
};

// --- COPY BUTTON LOGIC ---
document.getElementById('btnCopyFormula').onclick = () => {
    const out = document.getElementById('formulaOutput');
    // Create a temporary element to extract text and handle line breaks
    const textToCopy = out.innerText; 

    navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = document.getElementById('btnCopyFormula');
        btn.innerText = "Copied!";
        btn.style.borderColor = "#4bca81";
        setTimeout(() => { 
            btn.innerText = "Copy Formatted Formula"; 
            btn.style.borderColor = "#0176d3";
        }, 2000);
    });
};

// --- FLOW LIST (Line break between Version and Date) ---
document.getElementById('flowSearchInput').addEventListener('change', async (e) => {
    const flow = allFlows.find(f => f.DeveloperName === e.target.value);
    if (!flow) return;
    
    const query = `SELECT+Id,VersionNumber,Status,LastModifiedDate+FROM+Flow+WHERE+Definition.DeveloperName='${flow.DeveloperName}'+ORDER+BY+VersionNumber+DESC`;
    const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=${query}`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
    const data = await res.json();
    const container = document.getElementById('flowResults');
    container.innerHTML = "";

    data.records.forEach(v => {
        const date = new Date(v.LastModifiedDate).toLocaleDateString();
        const div = document.createElement('div');
        div.className = "card flow-card";
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                <div style="display: flex; flex-direction: column;">
                    <a href="#" class="field-link">Version ${v.VersionNumber}</a>
                    <span class="flow-meta-text">Last Modified Date: ${date}</span>
                </div>
                <b style="font-size: 11px; color: #008a00;">${v.Status}</b>
            </div>`;
        
        div.querySelector('.field-link').onclick = (e) => {
            e.preventDefault();
            chrome.tabs.create({ url: `${vault.instanceUrl.replace('.my.salesforce.com', '.lightning.force.com')}/builder_platform_interaction/flowBuilder.app?flowId=${v.Id}` });
        };
        container.appendChild(div);
    });
});

async function fetchAllFlows() {
    const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=SELECT+DeveloperName,MasterLabel+FROM+FlowDefinition+ORDER+BY+MasterLabel+ASC`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
    const data = await res.json();
    allFlows = data.records;
    const list = document.getElementById('flowList');
    allFlows.forEach(f => { let opt = document.createElement('option'); opt.value = f.DeveloperName; opt.textContent = f.MasterLabel; list.appendChild(opt); });
}

// --- FLOW SEARCH (Clean Version & Hyperlinks) ---
async function fetchFlowVersions(devName) {
    const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=SELECT+Id,VersionNumber,Status,LastModifiedDate+FROM+Flow+WHERE+Definition.DeveloperName='${devName}'+ORDER+BY+VersionNumber+DESC`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
    const data = await res.json();
    const container = document.getElementById('flowResults'); 
    container.innerHTML = "";
    
    data.records.forEach(v => {
        const date = new Date(v.LastModifiedDate).toLocaleDateString();
        const div = document.createElement('div'); 
        div.className = "card flow-card"; 
        
        div.innerHTML = `
            <div style="width:100%; display:flex; align-items:center;">
                <a href="#" class="field-link" style="margin-right:12px;">Version ${v.VersionNumber}</a>
                <span class="flow-meta-text">${date} — <b>${v.Status}</b></span>
            </div>`;
            
        div.querySelector('.field-link').onclick = (e) => {
            e.preventDefault();
            const url = `${vault.instanceUrl.replace('.my.salesforce.com', '.lightning.force.com')}/builder_platform_interaction/flowBuilder.app?flowId=${v.Id}`;
            chrome.tabs.create({ url });
        };
        container.appendChild(div);
    });
}


function switchTab(t) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(t + 'View').style.display = 'flex';
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.add('active');
}
document.getElementById('tabFields').onclick = () => switchTab('field');
document.getElementById('tabFormula').onclick = () => switchTab('formula');
document.getElementById('tabFlows').onclick = () => switchTab('flow');

// --- SALESFORCE INSPECTOR EXPORT FIX ---
document.getElementById('btnInspector').onclick = () => {
    const objName = document.getElementById('objInput').value;
    if (!objName || selectedFields.size === 0) return;

    const query = `SELECT ${Array.from(selectedFields).join(', ')} FROM ${objName}`;
    const host = new URL(vault.instanceUrl).hostname;
    
    // Constructing the direct Data Export URL for the Inspector extension
    const exportUrl = `chrome-extension://hpijlohoihegkfehhibggnkbjhoemldh/data-export.html?host=${host}&query=${encodeURIComponent(query)}`;
    chrome.tabs.create({ url: exportUrl });
};


