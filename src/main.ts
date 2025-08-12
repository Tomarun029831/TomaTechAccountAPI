const PEPPER = (() => {
    const v = PropertiesService.getScriptProperties().getProperty("PEPPER");
    if (!v) throw new Error("PEPPER is not set");
    return v;
})();
const ACCOUNT_INFO_LEN = 3;
const ROAMBIRD_INFO_LEN = 6;
const ACCOUNT_SHEET_NAME = "Account";
const ROAMBIRD_SHEET_NAME = "RoamBird";

type AccountInfo = {
    username: string, // username is unique in TomaTechDatabase
    password: string
};

type StageData = {
    totalTimer: string;          // TimeSpan → JSONでは文字列
    timerPerStage: string;       // 同上
    totalGoalCounter: number;    // uint → number
    streakGoalCounter: number;   // uint → number
};

type TrackData = {
    trackingDatas: {
        [key: string]: StageData; // uintキーはJSONでstring化される
    };
};

function sendJSON(obj: any): GoogleAppsScript.Content.TextOutput {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
    let result: boolean = false;
    let payload: object = {};
    let plainUsername: string = "";
    let plainPassword: string = "";

    let body: any;
    try {
        body = JSON.parse(e.postData.contents);
    } catch (err) {
        return sendJSON({ result: "failed", payload: "Invalid JSON" });
    }
    const mode = body.mode as string
    const plainToken = body.token as string;

    switch (mode) {
        case "CREATE":
            plainUsername = body.username as string;
            plainPassword = body.password as string;
            result = createNewAccount(plainUsername, plainPassword);
            if (result) payload = { token: generateToken(plainUsername) };
            break;

        case "AUTHENTICATE":
            plainUsername = body.username as string;
            plainPassword = body.password as string;
            result = authenticateAccount(plainUsername, plainPassword);
            if (result) payload = { token: generateToken(plainUsername) };
            break;

        case "PUSH":
            const trackedData: TrackData = body.trackingDatas as TrackData;
            result = pushTrackedData(plainToken, trackedData);
            break;

        case "PULL":
            ({ isSuccess: result, trackedData: payload } = pullTrackedData(plainToken));
            break;

        default:
            break;
    }

    logAccess(mode, plainUsername, result);
    let responseObj: { result: string, payload: object } = { result: result ? "success" : "failed", payload: payload };
    return sendJSON(responseObj);
}

function logAccess(mode: string, username: string, result: boolean): void {
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

function createNewAccount(plainUsername: string, plainPassword: string): boolean {
    if (plainUsername == null || plainPassword == null) return false;

    const foundRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (foundRow !== -1) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ACCOUNT_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ACCOUNT_SHEET_NAME);
        sheet.appendRow(["Username", "Password", "Salt"]);
    }
    const lastRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(lastRow, 1, 1, ACCOUNT_INFO_LEN);

    const generatedSalt = Utilities.getUuid();
    const authenticPassword = hashPassword(plainPassword, generatedSalt);

    const accountInfo = [[plainUsername, authenticPassword, generatedSalt]];
    range.setValues(accountInfo)

    return true;
}

function authenticateAccount(plainUsername: string, plainPassword: string): boolean {
    if (plainUsername == null || plainPassword == null) return false;

    const fonudRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (fonudRow === -1) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ACCOUNT_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ACCOUNT_SHEET_NAME);
        sheet.appendRow(["Username", "Password", "Salt"]);
    }
    const range = sheet.getRange(fonudRow, 1, 1, ACCOUNT_INFO_LEN);
    const values = range.getValues().flat();

    const storedPassword = values[1];
    const storedSalt = values[2];
    const authenticPassword = hashPassword(plainPassword, storedSalt);

    const isSuccess: boolean = (authenticPassword === storedPassword);
    return isSuccess;
}

/*

{
  "mode": "PUSH",
  "trackingDatas": {
    "1": {
      "totalTimer": "00:00:00",
      "timerPerStage": "10675199.02:48:05.4775807",
      "totalGoalCounter": 0,
      "streakGoalCounter": 0
    },
    "2": {
      "totalTimer": "00:05:23.4560000",
      "timerPerStage": "00:01:00",
      "totalGoalCounter": 5,
      "streakGoalCounter": 3
    }
  }
}

*/

function pullTrackedData(token: string): { isSuccess: boolean, trackedData: object } {
    console.log("pullTrackedData called with " + token);
    const { isVerified, username } = verifyToken(token);
    if (!isVerified) return { isSuccess: false, trackedData: {} };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ROAMBIRD_SHEET_NAME);
    if (!sheet) return { isSuccess: false, trackedData: {} };
    const data = sheet.getDataRange().getValues();
    const rowsByUsername = data.filter(row => row[0] === username);
    console.log(rowsByUsername);

    const storedTrackedDatas: TrackData = { trackingDatas: {} };

    rowsByUsername.forEach(row => {
        const stageIndex = String(row[1]); // キーは文字列化
        storedTrackedDatas.trackingDatas[stageIndex] = {
            totalTimer: row[2],
            timerPerStage: row[3],
            totalGoalCounter: Number(row[4]),
            streakGoalCounter: Number(row[5])
        };
    });

    return { isSuccess: true, trackedData: storedTrackedDatas };
}

/*
{
  "mode": "PUSH",
  "token": sometoken
  "trackingDatas": {
    "1": {
      "totalTimer": "00:00:00",
      "timerPerStage": "10675199.02:48:05.4775807",
      "totalGoalCounter": 0,
      "streakGoalCounter": 0
    },
    "2": {
      "totalTimer": "00:05:23.4560000",
      "timerPerStage": "00:01:00",
      "totalGoalCounter": 5,
      "streakGoalCounter": 3
    }
  }
}

*/


function pushTrackedData(token: string, trackedData: TrackData): boolean {
    console.log(`pushTrackedData called with token: ${token} trackedData: ${JSON.stringify(trackedData)}`);

    const { isVerified, username } = verifyToken(token);
    if (!isVerified) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ROAMBIRD_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ROAMBIRD_SHEET_NAME);
        sheet.appendRow([
            "username",
            "StageIndex",
            "TotalTime",
            "ShortestTime",
            "TotalGoalCount",
            "StreakGoalCount"
        ]);
    }

    const data = sheet.getDataRange().getValues();

    data.forEach((row, idx) => {
        if (row[0] === username) {
            // rowIndex is 1-based
            const stageIndex = String(row[1]);
            const trackData = trackedData.trackingDatas[stageIndex];
            const newValues = [[
                stageIndex,
                trackData?.totalTimer,
                trackData?.timerPerStage,
                trackData?.totalGoalCounter,
                trackData?.streakGoalCounter
            ]];

            sheet.getRange(idx + 1, 2, 1, ROAMBIRD_INFO_LEN - 1).setValues(newValues);
        }
    });

    return true;
}


function generateToken(username: string): string {
    const token = generateJWT(username, PEPPER, 3600); // available while one hour
    return token;
}

function verifyToken(token: string): { isVerified: boolean; username: string; } {
    return verifyJWT(token, PEPPER);
}

function base64urlEncode(obj: object): string {
    const json = JSON.stringify(obj);
    const bytes = Utilities.newBlob(json).getBytes();
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function generateJWT(username: string, secret: string, expiresInSec: number): string {
    const header = { alg: "HS256", typ: "JWT" };
    const nowSec = Math.floor(Date.now() / 1000);

    const fullPayload = {
        username: username,
        iat: nowSec,
        exp: nowSec + expiresInSec
    };

    const headerB64 = base64urlEncode(header);
    const payloadB64 = base64urlEncode(fullPayload);

    const data = `${headerB64}.${payloadB64}`;
    const signatureBytes = Utilities.computeHmacSha256Signature(data, secret);
    const signatureB64 = Utilities.base64EncodeWebSafe(signatureBytes).replace(/=+$/, "");

    return `${data}.${signatureB64}`;
}

function verifyJWT(token: string, secret: string): { isVerified: boolean, username: string } {
    const parts = token.split(".");
    if (parts.length !== 3) return { isVerified: false, username: "" };

    const [headerB64, payloadB64, signatureB64] = parts;
    if (headerB64 === undefined || payloadB64 === undefined || signatureB64 === undefined) return { isVerified: false, username: "" };
    const data = `${headerB64}.${payloadB64}`;

    const expectedSigBytes = Utilities.computeHmacSha256Signature(data, secret);
    const expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSigBytes).replace(/=+$/, "");
    if (signatureB64 !== expectedSigB64) return { isVerified: false, username: "" };

    const payloadJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
    const payload = JSON.parse(payloadJson);

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) return { isVerified: false, username: "" };

    return { isVerified: true, username: payload.username };
}

function hashPassword(plainPassword: string, plainSalt: string): string {
    const concatnated = plainPassword + plainSalt + PEPPER;
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, concatnated); // HACK: be more secure
    return rawHash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function searchRowIndexOfMatchedAccount(username: string): number {
    const ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNT_SHEET_NAME);
    if (!ss) return -1;

    const lastRow = ss.getLastRow();
    if (lastRow < 2) return -1; // No Data

    const range = ss.getRange(2, 1, lastRow - 1, 1); // Get Username Column
    if (range === null) return -1;
    const usernames = range.getValues().flat();

    const index = usernames.findIndex(name => name === username);
    return (index === -1) ? -1 : index + 2;
}


/* PEPPER
function initAllProperties(): void {
    PropertiesService.getScriptProperties().deleteAllProperties();
    initPepper();
}

function deletePepper(): void {
    PropertiesService.getScriptProperties().deleteProperty(PEPPER);
}

function printPepper(): void {
    const pepper = PropertiesService.getScriptProperties().getProperty(PEPPER);
    Logger.log(pepper);
}

function initPepper(): void {
    const pair = { PEPPER: Utilities.getUuid() };
    PropertiesService.getScriptProperties().setProperties(pair);
}
*/
