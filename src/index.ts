const PEPPER = (() => {
    const v = PropertiesService.getScriptProperties().getProperty("PEPPER");
    if (!v) throw new Error("PEPPER is not set");
    return v;
})();
const ACCOUNT_INFO_LEN = 4;
const ROAMBIRD_INFO_LEN = 6;
const ACCOUNT_SHEET_NAME = "Account";
const ROAMBIRD_SHEET_NAME = "RoamBird";

/**
1. 認証トークン（JWTなど）
クライアントはログイン情報を送信し、GASがJWTを発行

クライアントはAPI呼び出しにJWTを必ずヘッダーに付ける

GASはJWTを検証し、期限切れ・不正なトークンなら拒否

2. API署名検証（HMAC）
APIリクエストにはパラメータをHMAC署名付きで送信

GASは受け取り次第、署名の正当性を検証し改ざんを防止

4. レートリミット
GASのCacheServiceを使い、ユーザーごと・IPごとにAPIコール回数を管理

一定期間にアクセス回数を超えたら拒否する制御を入れる
*/


function sendJSON(obj: any): GoogleAppsScript.Content.TextOutput {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e: { parameter: { mode: string; accountData: { username: string; password: string; }; }; headers: { [x: string]: any; }; body: any; }): GoogleAppsScript.Content.TextOutput {
    const mode = e.parameter.mode;
    const plainUsername = e.parameter.accountData.username;
    const plainPassword = e.parameter.accountData.password;
    const plainToken = e.headers["authorization"];
    const trackedData = e.body;
    let result: boolean = false;

    switch (mode) {
        case "CREATE":
            result = createNewAccount(plainUsername, plainPassword);
            if (result) {
                const token = generateToken(plainUsername);
                return sendJSON({ result: "success", token });
            }
            break;

        case "AUTHENTICATE":
            result = authenticateAccount(plainUsername, plainPassword);
            if (result) {
                const token = generateToken(plainUsername);
                return sendJSON({ result: "success", token });
            }
            break;
        case "PUSH":
            result = pushTrackedData(plainToken, trackedData);
            break;

        case "PULL":
            result = pullTrackedData(plainToken);
            break;
        default:
            break;
    }

    logAccess(mode, plainUsername, result);

    const responseJSON = JSON.stringify({ message: "post API", result: result ? "success" : "failed" });
    return ContentService.createTextOutput(responseJSON).setMimeType(ContentService.MimeType.JSON);
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
    if (plainUsername == null || plainPassword == null) { throw new ReferenceError("user_name or password is null or undefined"); }

    const foundRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (foundRow !== -1) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ACCOUNT_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ACCOUNT_SHEET_NAME);
        sheet.appendRow(["Uuid", "Username", "Password", "Salt"]);
    }

    const lastRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(lastRow, 1, 1, ACCOUNT_INFO_LEN);

    const generatedUuid = Utilities.getUuid();
    const generatedSalt = Utilities.getUuid();
    const authenticPassword = hashPassword(plainPassword, generatedSalt);

    const accountInfo = [[generatedUuid, plainUsername, authenticPassword, generatedSalt]];
    range.setValues(accountInfo)

    return true;
}

function authenticateAccount(plainUsername: string, plainPassword: string): boolean {
    if (plainUsername == null || plainPassword == null) { throw new ReferenceError("user_name or password is null or undefined"); }

    const fonudRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (fonudRow === -1) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ACCOUNT_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ACCOUNT_SHEET_NAME);
        sheet.appendRow(["Uuid", "Username", "Password", "Salt"]);
    }
    const range = sheet.getRange(fonudRow, 1, 1, ACCOUNT_INFO_LEN).getValues().flat();

    // const storedUuid = range[0];
    // const storedUsername = range[1];
    const storedPassword = range[2];
    const storedSalt = range[3];

    return hashPassword(plainPassword, storedSalt) === storedPassword;
}

function pullTrackedData(token: string): boolean {
    console.log("pullTrackedData called with " + token);
    if (!verifyToken(token)) return false;

    const fonudRow = searchRowIndexOfMatchedRoamBird(plainUsername);
    if (fonudRow === -1) return false;


    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ROAMBIRD_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ROAMBIRD_SHEET_NAME);
        sheet.appendRow(["Uuid", "StageIndex", "TotalTime", "ShortestTime", "TotalGoalCount", "StreakGoalCount"]);
    }
    const range = sheet.getRange(fonudRow, 1, 1, ROAMBIRD_INFO_LEN).getValues().flat();

    // TODO: implement

    return true;
}

function pushTrackedData(token: string, trackedData: string): boolean {
    console.log("pushTrackedData called with token: " + token + " trackedData " + trackedData);
    if (!verifyToken(token)) return false;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(ROAMBIRD_SHEET_NAME);
    if (!sheet) {
        sheet = ss.insertSheet(ROAMBIRD_SHEET_NAME);
        sheet.appendRow(["Uuid", "StageIndex", "TotalTime", "ShortestTime", "TotalGoalCount", "StreakGoalCount"]);
    }
    // TODO: implement

    return true;
}

function generateToken(username: string): string {
    const payload = { username };
    const token = generateJWT(payload, PEPPER, 3600); // available while one hour
    return token;
}

function verifyToken(token: string): boolean {
    return verifyJWT(token, PEPPER);
}

function base64urlEncode(obj: object): string {
    const json = JSON.stringify(obj);
    const bytes = Utilities.newBlob(json).getBytes();
    return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function generateJWT(payload: object, secret: string, expiresInSec: number): string {
    const header = { alg: "HS256", typ: "JWT" };
    const nowSec = Math.floor(Date.now() / 1000);

    const fullPayload = {
        ...payload,
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

function verifyJWT(token: string, secret: string): boolean {
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    const [headerB64, payloadB64, signatureB64] = parts;
    const data = `${headerB64}.${payloadB64}`;

    const expectedSigBytes = Utilities.computeHmacSha256Signature(data, secret);
    const expectedSigB64 = Utilities.base64EncodeWebSafe(expectedSigBytes).replace(/=+$/, "");
    if (signatureB64 !== expectedSigB64) return false;

    // ペイロードを復号して有効期限チェック
    if (payloadB64 === undefined) return false;
    const payloadJson = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
    const payload = JSON.parse(payloadJson);

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp) {
        return false; // 期限切れ
    }

    return true;
}

function hashPassword(plainPassword: string, plainSalt: string): string {
    const concatnated = plainPassword + plainSalt + PEPPER;
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, concatnated); // HACK: be more secure
    return rawHash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function searchRowIndexOfMatchedRoamBird(uuid: string, stageIndex: number): number {
    const array = [uuid, stageIndex];
    const ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROAMBIRD_SHEET_NAME);
    if (!ss) return -1;

    const lastRow = ss.getLastRow();
    if (lastRow < 2) return -1;

    const range = ss.getRange(2, 1, lastRow - 1, 2);
    if (range === null) return -1;
    const uuidAndStageIndex: (string | number)[][] = range.getValues();
    let rowIndex = 0;

    for (const storedUuidAndStageIndex of uuidAndStageIndex) {
        if (storedUuidAndStageIndex[0] === uuid && storedUuidAndStageIndex[1] === stageIndex)
            return rowIndex + 1;
        rowIndex++;
    }

    return -1;
}

function searchRowIndexOfMatchedAccount(username: string): number {
    const ss = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ACCOUNT_SHEET_NAME);
    if (!ss) return -1;

    const lastRow = ss.getLastRow();
    if (lastRow < 2) return -1; // No Data

    const range = ss.getRange(2, 2, lastRow - 1, 1); // Get Username Column
    if (range === null) return -1;
    const usernames = range.getValues().flat();

    const index = usernames.findIndex(name => name === username);
    return (index === -1) ? -1 : index + 1;
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
