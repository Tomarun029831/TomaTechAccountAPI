const PEPPER = PropertiesService.getScriptProperties().getProperty("PEPPER");
const MAX_COLUMN = 4;

function logAccess(mode: string, username: string, result: boolean) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Log");

    if (!sheet) {
        sheet = ss.insertSheet("Log");
        sheet.appendRow(["Timestamp", "Mode", "Username", "Result"]);
    }

    const now = new Date();
    sheet.appendRow([
        now.toLocaleString(),
        mode,
        username,
        result
    ]);
}


function doPost(e: { parameter: { mode: any; username: any; password: any; }; }) {
    const mode = e.parameter.mode;
    const plainUsername = e.parameter.username;
    const plainPassword = e.parameter.password;
    let result: boolean = false;

    switch (mode) {
        case "CREATE":
            result = createNewAccount(plainUsername, plainPassword);
            break;
        case "AUTHENTICATE":
            result = authenticateAccount(plainUsername, plainPassword);
            break;
        default:
            break;
    }

    logAccess(mode, plainUsername, result);

    const responseJSON = JSON.stringify({ message: "post API", result: result });

    return ContentService.createTextOutput(responseJSON).setMimeType(ContentService.MimeType.JSON);
}

function createNewAccount /*: boolean*/(plainUsername: string, plainPassword: string): boolean {
    if (plainUsername == null || plainPassword == null) { throw new ReferenceError("user_name or password is null or undefined"); }

    const foundRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (foundRow !== -1) { return false; }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Account");
    if (sheet === null) return false;
    const lastRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(lastRow, 1, 1, MAX_COLUMN);

    // Uuid
    const Uuid = Utilities.getUuid();
    // password
    const salt = Utilities.getUuid();
    const authenticPassword = hashPassword(plainPassword, salt);

    const accountInfo = [[Uuid, plainUsername, authenticPassword, salt]];
    range.setValues(accountInfo)

    return true;
}

function authenticateAccount /*: boolean*/(plainUsername: string, plainPassword: string): boolean {
    const fonudRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (fonudRow === -1) { return false; }

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Account");
    if (sheet === null) return false;
    const range = sheet.getRange(fonudRow, 1, 1, MAX_COLUMN).getValues().flat();

    const storedUuid = range[0];
    const storedUsername = range[1];
    const storedPassword = range[2];
    const storedSalt = range[3];

    return hashPassword(plainPassword, storedSalt) === storedPassword;
}

function hashPassword /*: string*/(plainPassword: string, plain_salt: string): string {
    const concatnated = plainPassword + plain_salt + PEPPER;
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, concatnated);
    return rawHash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function searchRowIndexOfMatchedAccount /*: int*/(user_name: string): number {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const range = spreadsheet.getRangeByName("Username");
    if (range === null) return -1;
    const usernames = range.getValues().flat();
    const index = usernames.findIndex(name => name === user_name);
    return (index === -1 && index <= 1) ? -1 : index + 1;
}


/*
{
    "message": "get API",
    "para_e": {
        "queryString": "para1=1",
        "contextPath": "",
        "contentLength": -1,
        "parameters": {
            "para1": [
                "1"
            ]
        },
        "parameter": {
            "para1": "1"
        }
    }
}
*/

/*
{
    "message": "post API",
    "para_e": {
        "contentLength": 7,
        "parameter": {
            "para1": "1"
        },
        "contextPath": "",
        "queryString": "",
        "parameters": {
            "para1": [
                "1"
            ]
        },
        "postData": {
            "contents": "para1=1",
            "length": 7,
            "name": "postData",
            "type": "application/x-www-form-urlencoded"
        }
    }
}
*/

/*
function initAllProperties(){
  PropertiesService.getScriptProperties().deleteAllProperties();
  initPepper();
}

function deletePepper(){
  PropertiesService.getScriptProperties().deleteProperty(PEPPER);
}

function printPepper(){
  const pepper = PropertiesService.getScriptProperties().getProperty(PEPPER);
  Logger.log(pepper);
}

function initPepper(){
  const pair = {PEPPER:Utilities.getUuid()};
  PropertiesService.getScriptProperties().setProperties(pair);
}
*/
