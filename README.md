# Salesforce Helper
**The Productivity Power-House for Salesforce Admins and Architects.**

## 🚀 Mission
Salesforce Helper was developed to eliminate the "administrative friction" inherent in managing complex Salesforce orgs. By bridging the gap between the standard Salesforce UI and the Tooling API, this extension empowers Admins to audit, debug, and navigate metadata with unprecedented speed.

## 🛠 Key Features

### 1. Architect-Style Formula Beautifier
Standard Salesforce formulas often become "walls of text," especially in complex implementations like Apttus or CPQ. 
* **Semantic Indentation:** Automatically reformats nested `IF`, `AND`, and `OR` logic into a branching visual hierarchy.
* **Syntax Highlighting:** Uses high-contrast color coding for functions, strings, and operators to prevent syntax errors before they happen.
* **One-Click Portability:** Clean "Copy" functionality to move formatted logic back into Salesforce instantly.

### 2. Intelligent Field Finder
Stop digging through the Object Manager. 
* **Instant Search:** Filter through hundreds of fields across any object in real-time.
* **Metadata Insight:** View API names and "Custom" status at a glance.
* **Deep Linking:** Jump directly to the specific Field Setup page with a single click.
* **Inspector Integration:** Seamlessly export selected field lists directly into Salesforce Inspector for data queries.

### 3. Flow Versioning Manager
Navigate the history of your automation without leaving your current tab.
* **Version Control:** View all versions, their active status, and last modified dates in a clean, vertical timeline.
* **Direct Access:** Open specific historical versions in the Flow Builder instantly.

 ### 4. Direct Export to Salesforce Inspector
Salesforce Helper acts as a precursor to data queries. 
* **Seamless Integration:** Select multiple fields within the Field Finder and click the "Export - Salesforce Inspector" button.
* **Auto-Query Generation:** The tool automatically constructs a valid SOQL query and injects it directly into the Salesforce Inspector Data Export page, saving the manual effort of typing field API names.

## 📈 Impact on Productivity
Salesforce Helper is designed to reduce metadata navigation time by up to 50%, allowing Admins to focus on solving business problems rather than searching for technical details.

## 🚀 How to Install & Use

Since this is a developer-focused toolkit, you can install it manually in seconds:

1. **Download the Code:** Click the green `Code` button above and select `Download ZIP`, then extract it to a folder on your computer.
2. **Open Chrome Extensions:** In your browser, go to `chrome://extensions/`.
3. **Enable Developer Mode:** Toggle the switch in the top-right corner to **On**.
4. **Load the Tool:** Click the `Load unpacked` button and select the folder where you extracted the files.
5. **Connect:** Open any Salesforce tab, click the **Salesforce Helper** icon in your toolbar, and start saving time!

---

## 📖 User Guide (screenshots)

### 1. Beautifying Formulas
Copy any complex Salesforce formula and paste it into the **Beautifier** tab. The tool will instantly restructure the logic. Click **Copy Formatted Formula** to paste it back into Salesforce.

### 2. Finding Fields
Select an Object from the dropdown. Use the filter bar to find specific fields. Click the field label to jump directly to that field's setup page in Salesforce.

### 3. Managing Flows
In the **Flows** tab, search for any Flow by name. You will see a list of all versions. Active versions are highlighted in green for quick identification.

### 4. Exporting to Salesforce Inspector
1. Choose an Object and search for your required fields.
2. Use the checkboxes to select the fields you need for a data export.
3. Click the green **Export - Salesforce Inspector** button at the top.
4. A new tab will open directly in the Salesforce Inspector interface with your `SELECT [Fields] FROM [Object]` query pre-populated and ready to run.
