let vault = { accessToken: '', instanceUrl: '' };
let allObjects = [], allFlows = [], currentFields = [], selectedFields = new Set();
let globalInstanceUrl = '';

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

async function getNewSessionToken(hostname) {
       // This is the "API Domain" where the valid session cookie lives
    let apiDomain = hostname.replace(".lightning.force.com", ".my.salesforce.com");
    
    // Getting the cookie from the API domain
    const cookie = await chrome.cookies.get({ 
        url: `https://${apiDomain}`, 
        name: 'sid' 
    });

    if (cookie) {
        vault.accessToken = cookie.value;
        vault.instanceUrl = `https://${apiDomain}`;
        console.log("Token & Instance URL updated for:", apiDomain);
    } else {
        // Fallback: Try the original hostname if the replacement didn't work
        const altCookie = await chrome.cookies.get({ url: `https://${hostname}`, name: 'sid' });
        if (altCookie) {
            vault.accessToken = altCookie.value;
            vault.instanceUrl = `https://${hostname}`;
        } else {
            throw new Error("No session cookie found. Log in to Salesforce first.");
        }
    }
}

async function initialize() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab && tab.url) {
        const url = new URL(tab.url);
        
        try {
           
            await getNewSessionToken(url.hostname); 

           
            await Promise.all([
                fetchUserInfo(),
                fetchAllObjects(),
                fetchAllFlows()
            ]);
            
            setupVRObjectSearch(); 
        } catch (err) {
            console.error("Initialization failed:", err.message);
        }
    }
}

async function fetchUserInfo() {
    try {
        const res = await fetch(`${vault.instanceUrl}/services/oauth2/userinfo`, { headers: { 'Authorization': `Bearer ${vault.accessToken}` } });
        const data = await res.json();
        document.getElementById('userNameDisplay').textContent = data.name;
        document.getElementById('orgNameDisplay').textContent = new URL(vault.instanceUrl).hostname.split('.')[0].toUpperCase();
    } catch(e) {}
}

document.getElementById('btnRefresh').onclick = async () => {
        const btn = document.getElementById('btnRefresh');
    btn.innerText = "Switching Org..."; 
    
    await initialize(); 
        
    location.reload();
};

// --- FIELD FINDER ---
async function fetchAllObjects() {
    try {
        const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=SELECT+QualifiedApiName,Label,DurableId+FROM+EntityDefinition+WHERE+IsCustomizable=true`, { 
            headers: { 'Authorization': `Bearer ${vault.accessToken}` } 
        });
        
        const data = await res.json();

        
        if (!data || !data.records) {
            console.error("Fetch failed. Records undefined. Check Auth.");
            return; 
        }

        allObjects = data.records.map(o => ({ name: o.QualifiedApiName, label: o.Label, id: o.DurableId }));
        
        const list = document.getElementById('objectList');
        if (!list) return;
        
        list.innerHTML = ''; 
        
        allObjects.sort((a,b) => a.label.localeCompare(b.label)).forEach(o => {
            let opt = document.createElement('option'); 
            opt.value = o.name; 
            opt.textContent = o.label; 
            list.appendChild(opt);
        });
    } catch (err) {
        console.error("Error in fetchAllObjects:", err);
    }
}
document.getElementById('objInput').oninput = async (e) => {
    const val = e.target.value;
    
    // 1. Find the object in your data array
    const obj = allObjects.find(o => o.name === val || o.label === val);
    
        if (!obj) {
        document.getElementById('fieldActions').style.display = 'none';
        return;
    }

    // 2. SHOW the actions bar immediately now that we have a match
    const actionsBar = document.getElementById('fieldActions');
    if (actionsBar) {
        actionsBar.style.setProperty('display', 'flex', 'important');
    }

    try {
        // 3. Fetch the fields
        const query = `SELECT QualifiedApiName,Label,DurableId FROM FieldDefinition WHERE EntityDefinitionId='${obj.name}'`;
        const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(query)}`, { 
            headers: { 'Authorization': `Bearer ${vault.accessToken}` } 
        });
        
        const data = await res.json();
        
        // 4. Map and Render
        currentFields = data.records.map(f => ({ 
            name: f.QualifiedApiName, 
            label: f.Label, 
            id: f.DurableId, 
            objId: obj.id, 
            objName: obj.name 
        }));
        
        renderFields(currentFields);
        
    } catch (err) {
        console.error("Error fetching fields:", err);
    }
};

document.getElementById('fieldSearchInput').oninput = (e) => {
    const term = e.target.value.toLowerCase();
    renderFields(currentFields.filter(f => f.label.toLowerCase().includes(term) || f.name.toLowerCase().includes(term)));
};

// --- FIELD FINDER & SELECT ALL ---
document.getElementById('selectAll').addEventListener('change', (e) => {
    const isChecked = e.target.checked;
    const checkboxes = document.querySelectorAll('.f-check');
    
    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        const fieldName = cb.dataset.name;
        if (isChecked) {
            selectedFields.add(fieldName);
        } else {
            selectedFields.delete(fieldName);
        }
    });
    
    
    if (typeof toggleInspectorBtn === "function") {
        toggleInspectorBtn();
    }
});

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

    
    let clean = raw.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim();

    let indentLevel = 0;
    let result = "";
    let inCompactMode = 0; 
    const indentSpace = "    "; 
    
    
    const compactFunctions = ["ISPICKVAL", "IMAGE", "HYPERLINK", "NOT", "ISBLANK", "TEXT", "PRIORVALUE"];

    
    const tokens = clean.split(/([(),])/);

    tokens.forEach((token, index) => {
        let t = token.trim();
        if (!t) return;

        if (t === "(") {
            
            let prevToken = tokens[index - 1]?.trim().toUpperCase();
            
            if (compactFunctions.includes(prevToken) || inCompactMode > 0) {
                inCompactMode++;
                result += "(";
            } else {
                indentLevel++;
                result += `(<br>${indentSpace.repeat(indentLevel)}`;
            }
        } 
        else if (t === ")") {
            if (inCompactMode > 0) {
                inCompactMode--;
                result += ")";
            } else {
                indentLevel = Math.max(0, indentLevel - 1);
                result += `<br>${indentSpace.repeat(indentLevel)})`;
            }
        } 
        else if (t === ",") {
            
            if (inCompactMode === 0) {
                result += `, <br>${indentSpace.repeat(indentLevel)}`;
            } else {
                result += ", ";
            }
        } 
        else {
            
            if (/^[A-Z_$.0-9]+\b/.test(t) && !t.includes('"') && !t.includes("'")) {
                result += `<span class="syntax-func">${t}</span>`;
            } else if (t.startsWith('"') || t.startsWith("'")) {
                result += `<span class="syntax-string">${t}</span>`;
            } else {
                result += t;
            }
        }
    });

    out.innerHTML = result.replace(/    /g, '&nbsp;&nbsp;&nbsp;&nbsp;');
    out.style.display = 'block';
    btn.style.display = 'block';
};

// --- COPY BUTTON LOGIC ---
document.getElementById('btnCopyFormula').onclick = () => {
    const out = document.getElementById('formulaOutput');
    const tempPre = document.createElement('pre');
    
    // Convert HTML to clean text with correct spacing
    tempPre.innerHTML = out.innerHTML
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/<[^>]*>/g, '');

    const textToCopy = tempPre.innerText.trim();

    navigator.clipboard.writeText(textToCopy).then(() => {
        const btn = document.getElementById('btnCopyFormula');
        btn.innerText = "Copied!";
        setTimeout(() => { btn.innerText = "Copy Formatted Formula"; }, 2000);
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
    const query = encodeURIComponent("SELECT Id, DeveloperName, MasterLabel FROM FlowDefinition ORDER BY MasterLabel ASC");
    const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/tooling/query?q=${query}`, { 
        headers: { 'Authorization': `Bearer ${vault.accessToken}` } 
    });
    const data = await res.json();
    
    if (data.records) {
        allFlows = data.records; 
        const list = document.getElementById('flowList');
        list.innerHTML = '';
        allFlows.forEach(f => {
            let opt = document.createElement('option');
            opt.value = f.DeveloperName; 
            opt.textContent = f.MasterLabel;
            list.appendChild(opt);
        });
    }
}


document.getElementById('flowSearchInput').oninput = (e) => {
    const val = e.target.value;
    
    
    const exists = allFlows.find(f => f.DeveloperName === val || f.MasterLabel === val);
    
    if (exists) {
       
        fetchFlowVersions(exists.DeveloperName);
    }
};

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



document.getElementById('tabFields').onclick = () => switchTab('field');
document.getElementById('tabFormula').onclick = () => switchTab('formula');
document.getElementById('tabFlows').onclick = () => switchTab('flow');


document.getElementById('btnInspector').onclick = () => {
    const objName = document.getElementById('objInput').value;
    if (!objName || selectedFields.size === 0) return;

    const query = `SELECT ${Array.from(selectedFields).join(', ')} FROM ${objName}`;
    const host = new URL(vault.instanceUrl).hostname;
    
    
    const exportUrl = `chrome-extension://hpijlohoihegkfehhibggnkbjhoemldh/data-export.html?host=${host}&query=${encodeURIComponent(query)}`;
    chrome.tabs.create({ url: exportUrl });
};


document.addEventListener('DOMContentLoaded', async function() {
    
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.url) {
        globalInstanceUrl = new URL(tab.url).hostname;
    }

    // --- 2. TAB SWITCHING LOGIC ---
 
const tabMap = {
    'tabFields': 'fieldView',
    'tabFormula': 'formulaView',
    'tabFlows': 'flowsView',
    'validation-search-tab': 'validationView',
	'btnOpenLVTab': 'listViewView'
};

Object.keys(tabMap).forEach(tabId => {
    const tabBtn = document.getElementById(tabId);
    if (tabBtn) {
        
        tabBtn.onclick = null; 

        tabBtn.addEventListener('click', function() {
            
            Object.keys(tabMap).forEach(id => {
                const t = document.getElementById(id);
                if (t) t.classList.remove('active');
            });

            
            document.querySelectorAll('.view').forEach(v => {
                v.style.display = 'none';
            });

            
            this.classList.add('active');
            const targetView = document.getElementById(tabMap[tabId]);
            if (targetView) {
                targetView.style.display = 'block';
            }
        });
    } else {
        console.warn(`Tab element with ID "${tabId}" was not found in HTML.`);
    }
});

    // --- 3. VALIDATION RULE SEARCH LOGIC ---

    const btnSearchVR = document.getElementById('btn-execute-vr-search');
    if (btnSearchVR) {
        btnSearchVR.addEventListener('click', async () => {
            const loader = document.getElementById('vr-loader');
            const resultsDiv = document.getElementById('vr-results');
            
            
            if (!resultsDiv) {
                console.error("Error: Element 'vr-results' not found in HTML.");
                return;
            }

            const nameVal = document.getElementById('vr-name').value;
            const objVal = document.getElementById('vr-object').value;
            const msgVal = document.getElementById('vr-message').value;

            
            if (loader) loader.style.display = 'block';
            resultsDiv.innerHTML = ''; 

            
            let query = "SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, ErrorMessage FROM ValidationRule WHERE Active = true";
            if (nameVal) query += ` AND ValidationName LIKE '%${nameVal}%'`;
            if (objVal)  query += ` AND EntityDefinition.QualifiedApiName = '${objVal}'`;
            if (msgVal)  query += ` AND ErrorMessage LIKE '%${msgVal}%'`;

            try {
                const data = await callToolingApi(query);
                if (loader) loader.style.display = 'none';
                
                if (data.records && data.records.length > 0) {
                    renderVRResults(data.records);
                } else {
                    resultsDiv.innerHTML = '<p style="padding:10px; font-size:12px;">No active rules found matching those criteria.</p>';
                }
            } catch (err) {
                if (loader) loader.style.display = 'none';
                resultsDiv.innerHTML = `<p style="color:red; padding:10px;">Error: ${err.message}</p>`;
            }
        });
    }
});

// Function to handle the autocomplete for VR object search
function setupVRObjectSearch() {
    const vrInput = document.getElementById('vr-object');
    const vrResults = document.getElementById('vrObjResults');

    if (!vrInput || !vrResults) return;

    vrInput.oninput = () => {
        const term = vrInput.value.toLowerCase();
        if (!term) {
            vrResults.style.display = 'none';
            return;
        }

        
        const matches = allObjects.filter(o => 
            o.label.toLowerCase().includes(term) || 
            o.name.toLowerCase().includes(term)
        ).slice(0, 10); // 

        if (matches.length > 0) {
            vrResults.innerHTML = matches.map(o => `
                <div class="search-item" data-api="${o.name}" style="padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; background: white;">
                    <div style="font-weight: bold; font-size: 12px;">${o.label}</div>
                    <div style="font-size: 10px; color: #666;">${o.name}</div>
                </div>
            `).join('');
            vrResults.style.display = 'block';
        } else {
            vrResults.style.display = 'none';
        }
    };

    // Selection logic
    vrResults.onclick = (e) => {
        const item = e.target.closest('.search-item');
        if (item) {
            vrInput.value = item.getAttribute('data-api');
            vrResults.style.display = 'none';
        }
    };

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!vrInput.contains(e.target) && !vrResults.contains(e.target)) {
            vrResults.style.display = 'none';
        }
    });
}

// --- 4. RENDER RESULTS ---
function renderVRResults(records) {
    const container = document.getElementById('vr-results');
    container.innerHTML = records.map(rule => `
        <div class="vr-result-card">
            <a href="https://${globalInstanceUrl}/lightning/setup/ObjectManager/${rule.EntityDefinition.QualifiedApiName}/ValidationRules/${rule.Id}/view" 
               target="_blank" class="vr-rule-name">
                ${rule.ValidationName}
            </a>
            <span class="vr-metadata-label">Object: ${rule.EntityDefinition.QualifiedApiName}</span>
            <div class="vr-error-msg">
                <strong>Error Message:</strong><br/>
                ${rule.ErrorMessage}
            </div>
        </div>
    `).join('');
}

// --- 5. LIST VIEW EXPORT LOGIC ---
async function fetchListViews() {
    const inputVal = document.getElementById('lv-object-input').value;
    const resultsDiv = document.getElementById('lv-results');
    const exportContainer = document.getElementById('lv-export-container');

    const obj = allObjects.find(o => o.label === inputVal || o.name === inputVal);
    const apiName = obj ? obj.name : inputVal;

    if (!apiName) return;

    resultsDiv.innerHTML = '<div style="padding:20px; text-align:center;">🔍 Searching List Views...</div>';
    exportContainer.style.display = 'none';

    try {
        
        const endpoint = `${vault.instanceUrl}/services/data/v60.0/sobjects/${apiName}/listviews`;
        
        const res = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${vault.accessToken}` }
        });
        const data = await res.json();

        if (data.listviews && data.listviews.length > 0) {
            resultsDiv.innerHTML = data.listviews.map(lv => `
                <div class="lv-row" style="padding:10px; border:1px solid #eee; margin-bottom:5px; border-radius:4px; display:flex; align-items:center; gap:10px; background:white;">
                    <input type="radio" name="selectedLV" value="${lv.id}" id="${lv.id}" class="lv-radio-select">
                    <label for="${lv.id}" style="flex:1; cursor:pointer;">
                        <div style="font-weight:bold; font-size:13px;">${lv.label}</div>
                        <code style="font-size:10px; color:#666;">${lv.developerName}</code>
                    </label>
                </div>
            `).join('');

            
            document.querySelectorAll('.lv-radio-select').forEach(radio => {
                radio.addEventListener('change', () => {
                    exportContainer.style.display = 'block'; 
                });
            });

        } else {
            resultsDiv.innerHTML = `<div style="padding:20px; color:#666;">No list views found for "${apiName}".</div>`;
        }
    } catch (err) {
        resultsDiv.innerHTML = `<div style="color:red; padding:10px;">API Error: This object may not support List View queries.</div>`;
    }
}



// A. Populate the Dropdown when Object is selected
document.getElementById('lv-object-input').oninput = async (e) => {
    const inputVal = e.target.value;
    const obj = allObjects.find(o => o.label === inputVal || o.name === inputVal);
    
    const dropdown = document.getElementById('lv-dropdown');
    const container = document.getElementById('lv-dropdown-container');

    if (!obj) {
        container.style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/sobjects/${obj.name}/listviews`, {
            headers: { 'Authorization': `Bearer ${vault.accessToken}` }
        });
        const data = await res.json();

        dropdown.innerHTML = '<option value="">-- 2. Select a List View --</option>';
        data.listviews.forEach(lv => {
            let opt = document.createElement('option');
            opt.value = lv.id;
            opt.textContent = lv.label;
            dropdown.appendChild(opt);
        });
        container.style.display = 'block';
    } catch (err) { console.error(err); }
};

// Show the Yellow Button only when a List View is selected
document.getElementById('lv-dropdown').onchange = (e) => {
    const footer = document.getElementById('lv-export-footer');
    footer.style.display = e.target.value ? 'block' : 'none';
};

// SAFE LISTENER: Handles the click without crashing
document.addEventListener('click', async (e) => {
    
    if (e.target && e.target.id === 'btnInspectorExportLV') {
        const lvId = document.getElementById('lv-dropdown').value;
        const objInput = document.getElementById('lv-object-input').value;
        
        
        const obj = allObjects.find(o => o.label === objInput || o.name === objInput);
        const apiName = obj ? obj.name : objInput;

        if (!lvId) return alert("Please select a List View first.");

        try {
            
            const res = await fetch(`${vault.instanceUrl}/services/data/v60.0/sobjects/${apiName}/listviews/${lvId}/describe`, {
                headers: { 'Authorization': `Bearer ${vault.accessToken}` }
            });
            const data = await res.json();
            
            if (!data.query) throw new Error("SOQL query not found for this view.");

            
            const host = new URL(vault.instanceUrl).hostname;
            const inspectorUrl = `chrome-extension://hpijlohoihegkfehhibggnkbjhoemldh/data-export.html?host=${host}&query=${encodeURIComponent(data.query)}`;
            
            
            chrome.tabs.create({ url: inspectorUrl });
        } catch (err) {
            alert("Export failed: " + err.message);
        }
    }
});




// --- 4. GLOBAL CLICK LISTENER (Fixes the "null" and "not defined" errors) ---
document.addEventListener('click', (e) => {
    if (e.target.id === 'btnInspectorExportLV') {
        executeInspectorExport();
    }
});

async function callToolingApi(query) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) throw new Error("No active Salesforce tab found.");
    
    const url = new URL(tab.url);
    
    let instanceUrl = url.hostname
        .replace(".lightning.force.com", ".my.salesforce.com")
        .replace(".sandbox.lightning.force.com", ".sandbox.my.salesforce.com");

    const cookie = await chrome.cookies.get({ url: `https://${instanceUrl}`, name: 'sid' });
    if (!cookie) throw new Error("Session not found. Please log in to Salesforce.");

    const endpoint = `https://${instanceUrl}/services/data/v60.0/tooling/query?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${cookie.value}`,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data[0]?.message || "API Request Failed");
    }
    return data;
}

//Clear Inputs
document.getElementById('btnGlobalReset').onclick = () => {
    
    selectedFields.clear();
    currentFields = [];
    
    
    const inputs = ['objInput', 'fieldSearchInput', 'formulaInput', 'flowSearchInput', 'vr-name', 'vr-object', 'vr-message', 'lv-object-input','lv-dropdown'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    
    const containers = ['results', 'formulaOutput', 'flowResults', 'vr-results'];
    containers.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = '';
            
            if (id === 'formulaOutput') el.style.display = 'none';
        }
    });

    
    document.getElementById('fieldActions').style.display = 'none';
    document.getElementById('btnInspector').style.display = 'none';
    document.getElementById('btnCopyFormula').style.display = 'none';
    
    
    const selectAll = document.getElementById('selectAll');
    if (selectAll) selectAll.checked = false;

    

    console.log("Full Reset Completed.");
};

document.getElementById('btnClearFormula').onclick = () => {
    const input = document.getElementById('formulaInput');
    const output = document.getElementById('formulaOutput');
    const copyBtn = document.getElementById('btnCopyFormula');
    
    input.value = '';
    output.innerHTML = '';
    output.style.display = 'none';
    copyBtn.style.display = 'none';
    input.focus();
};