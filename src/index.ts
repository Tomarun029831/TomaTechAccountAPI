const PEPPER = PropertiesService.getScriptProperties().getProperty("PEPPER");
const ACCOUNT_INFO_LEN = 4;

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

function doPost(e: { parameter: { mode: any; accountData: { username: any; password: any; }; }; headers: { [x: string]: any; }; body: any; }): GoogleAppsScript.Content.TextOutput {
    const mode = e.parameter.mode;
    const plainUsername = e.parameter.accountData.username;
    const plainPassword = e.parameter.accountData.password;
    const plainToken = e.headers["authorization"];
    const trackedData = e.body;
    let result: boolean = false;

    switch (mode) {
        case "CREATE":
            result = createNewAccount(plainUsername, plainPassword);
            break;
        case "AUTHENTICATE":
            result = authenticateAccount(plainUsername, plainPassword);
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

    const responseJSON = JSON.stringify({ message: "post API", result: result });
    return ContentService.createTextOutput(responseJSON).setMimeType(ContentService.MimeType.JSON);
}

function logAccess /**: void*/(mode: string, username: string, result: boolean): void {
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
    if (foundRow !== -1) { return false; }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Account");
    if (!sheet) {
        sheet = ss.insertSheet("Account");
        sheet.appendRow(["Uuid", "Username", "Password", "Salt"]);
    }

    const lastRow = sheet.getLastRow() + 1;
    const range = sheet.getRange(lastRow, 1, 1, ACCOUNT_INFO_LEN);

    const Uuid = Utilities.getUuid();
    const salt = Utilities.getUuid();
    const authenticPassword = hashPassword(plainPassword, salt);

    const accountInfo = [[Uuid, plainUsername, authenticPassword, salt]];
    range.setValues(accountInfo)

    return true;
}

function authenticateAccount(plainUsername: string, plainPassword: string): boolean {
    const fonudRow = searchRowIndexOfMatchedAccount(plainUsername);
    if (fonudRow === -1) { return false; }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("Account");
    if (!sheet) {
        sheet = ss.insertSheet("Account");
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
    if (!verifyToken(token)) {
        throw new Error("Invalid or expired token");
    }
    // TODO: implement

    return false;
}


function pushTrackedData(token: string, trackedData: string): boolean {
    console.log("pushTrackedData called with token: " + token + " trackedData " + trackedData);
    if (!verifyToken(token)) {
        throw new Error("Invalid or expired token");
    }
    // TODO: implement

    return false;
}

function hashPassword(plainPassword: string, plain_salt: string): string {
    const concatnated = plainPassword + plain_salt + PEPPER;
    const rawHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, concatnated);
    return rawHash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function verifyToken(token: string): boolean {
    console.log("verifyToken called with " + token);
    return false;
}

function searchRowIndexOfMatchedAccount(username: string): number {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const range = spreadsheet.getRangeByName("Username");
    if (range === null) return -1;
    const usernames = range.getValues().flat();
    const index = usernames.findIndex(name => name === username);
    return (index === -1 && index <= 1) ? -1 : index + 1;
}

/**
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
