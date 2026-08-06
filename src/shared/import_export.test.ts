import { describe, expect, it } from "vitest";
import {
  detectAndParseImport,
  parseLastPassCsv,
} from "./import_export";

describe("parseLastPassCsv", () => {
  it("maps LastPass columns including folder and totp", () => {
    const raw = `url,username,password,totp,extra,name,grouping,fav
https://github.com,octocat,p@ss,otpauth://totp/GitHub:octocat?secret=JBSWY3DPEHPK3PXP&issuer=GitHub,,GitHub,Work,0
http://sn,,,,"secure note body",My Note,Notes,0
`;
    const items = parseLastPassCsv(raw);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "GitHub",
      username: "octocat",
      password: "p@ss",
      urls: ["https://github.com"],
      folder: "Work",
    });
    expect(items[0]!.totp?.secret).toBe("JBSWY3DPEHPK3PXP");
    expect(items[1]).toMatchObject({
      title: "My Note",
      urls: ["http://sn"],
      notes: "secure note body",
      folder: "Notes",
    });
  });

  it("detects LastPass via grouping header", () => {
    const raw = `url,username,password,totp,extra,name,grouping,fav
https://a.test,u,p,,,A,,0
`;
    const items = detectAndParseImport(raw);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe("A");
  });

  it("honors lastPassCsv hint", () => {
    const raw = `url,username,password,totp,extra,name,grouping,fav
https://b.test,u,p,,,B,Folder,0
`;
    const items = detectAndParseImport(raw, "lastPassCsv");
    expect(items[0]!.folder).toBe("Folder");
  });
});
