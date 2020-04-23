const fs = require("fs").promises;
const conf = require("config");
require("date-utils");
const csvParse = require("csv-parse/lib/sync");
const Dir_conf = conf.setting.Dir;
const dc_conf = conf.setting.Threshold.deterioration_count;

const dt = new Date();
const formatted = dt.toFormat("YYYYMMDDHH24MISS");

const col_RACH_1 = "RACH: rach_denomi3";
const col_Throughput_1 = "end user throughput for DL[kbps]: QCI-9_DL";
const col_Throughput_2 = "end user throughput for UL[kbps]: QCI-9_UL";
const col_VoLTE_1 = "E-RAB_Success_Ratio: ERAB_Success_Ratio_QCI_1";
const col_VoLTE_2 = "E-RAB_Drop_Ratio: ERAB_Drop_Ratio_QCI_1";

const csvParseOption = {
  delimiter: ";",
  relax_column_count: true,
  columns: true,
};

const get_and_add_ids = (fileNames, fileDatas, mode) => {
  let ids = [];
  for (e of fileNames) {
    for (ee of fileDatas[e]) {
      if (mode == "RACH") {
        if (ee["RNC ID"] && ee["WBTS ID"]) {
          const ukey = `${ee["RNC ID"]}_${ee["WBTS ID"]}`;
          ee["ukey"] = ukey;
          ee["PERIOD_START_TIME"] = strToDate(ee["PERIOD_START_TIME"]);
        } else {
          ee["ukey"] = null;
        }
      } else if (mode == "Throughput") {
        if (ee["MRBTS ID"] && ee["LNCEL ID"]) {
          const ukey = `${ee["MRBTS ID"]}_${ee["LNCEL ID"]}`;
          ee["ukey"] = ukey;
          ee["PERIOD_START_TIME"] = strToDate(ee["PERIOD_START_TIME"]);
        } else {
          ee["ukey"] = null;
        }
      } else if (mode == "VoLTE") {
        if (ee["MRBTS ID"] && ee["LNCEL ID"]) {
          const ukey = `${ee["MRBTS ID"]}_${ee["LNCEL ID"]}`;
          ee["ukey"] = ukey;
          ee["PERIOD_START_TIME"] = strToDate(ee["PERIOD_START_TIME"]);
        } else {
          ee["ukey"] = null;
        }
      }
    }
    let tmplist = fileDatas[e].map((ee) => {
      if (ee["ukey"]) return `${ee["ukey"]}`;
    });
    ids = ids.concat(tmplist);
  }
  ids = ids.filter((e, i, self) => self.indexOf(e) === i && e);
  return ids;
};

const get_sortValues = (needData) => {
  needData.sort((a, b) =>
    a["PERIOD_START_TIME"] < b["PERIOD_START_TIME"] ? 1 : -1
  );
  return needData;
};

const strToDate = (str) => {
  const list = str.split(" ");
  const dl = list[0].split(".");
  const YYYY = dl[2];
  const MM = dl[0];
  const DD = dl[1];
  const tl = list[1].split(":");
  const hh = tl[0];
  const mm = tl[1];
  const ss = tl[2];
  const date = new Date(YYYY, MM, DD, hh, mm, ss);
  return date;
};

const get_deteriorationCount = (needData, mode, col) => {
  const TH_conf_VoLTE = conf.setting.Threshold.VoLTE;
  const TH_conf_Throughput = conf.setting.Threshold.Throughput;
  const TH_conf_RACH = conf.setting.Threshold.RACH;
  let count = 0;
  needData.forEach((e) => {
    if (e[col]) {
      if (mode == "RACH") {
        const value = Number(e[col]);
        if (value <= (TH_conf_RACH.RACH_DENOMI3 / 100) * 1800) {
          count += 1;
        }
      } else if (mode == "Throughput") {
        if (col == col_Throughput_1) {
          if (Number(e[col]) < TH_conf_Throughput.QCI_9_DL) {
            count += 1;
          }
        } else if (col == col_Throughput_2) {
          if (Number(e[col]) < TH_conf_Throughput.QCI_9_UL) {
            count += 1;
          }
        }
      } else if (mode == "VoLTE") {
        if (col == col_VoLTE_1) {
          if (Number(e[col]) < TH_conf_VoLTE.ERAB_SUCCESS_RATIO_QCI_1) {
            count += 1;
          }
        } else if (col == col_VoLTE_2) {
          if (Number(e[col]) >= TH_conf_VoLTE.ERAB_DROP_RATIO_QCI_1) {
            count += 1;
          }
        }
      }
    }
  });
  return count;
};

const get_fileNames = async (dir) => {
  let fileNames = await fs.readdir(dir);
  const todayFileName = fileNames.find((e) => e.includes("AF"));
  const yesterdayFileName = fileNames.find((e) => e.includes("BF"));
  fileNames = [todayFileName, yesterdayFileName];
  return fileNames;
};

const get_fileData = async (dir, todayFileName, yesterdayFileName) => {
  let fileDatas = {};
  const data1 = await fs.readFile(`${dir}/${todayFileName}`);
  const data2 = await fs.readFile(`${dir}/${yesterdayFileName}`);
  fileDatas[todayFileName] = await csvParse(data1, csvParseOption);
  fileDatas[yesterdayFileName] = await csvParse(data2, csvParseOption);
  return fileDatas;
};

const get_result = async (ids, todayData, yesterdayData, columns, mode) => {
  let result = {};
  for (col of columns) {
    result[col] = {};
    for (id of ids) {
      result[col][id] = {};
      let needTodayData = await todayData.filter((e) => e["ukey"] == id);
      let needYesterdayData = await yesterdayData.filter(
        (e) => e["ukey"] == id
      );
      needTodayData = get_sortValues(needTodayData);
      needYesterdayData = get_sortValues(needYesterdayData);
      const today_dc = get_deteriorationCount(needTodayData, mode, col);
      result[col][id]["today"] = needTodayData[0][col];
      result[col][id]["yesterday"] = needYesterdayData[0][col];
      result[col][id]["dc"] = today_dc;
    }
  }
  return result;
};

const RACH_func = async () => {
  const readDir = Dir_conf.RACH;
  const fileNames = await get_fileNames(readDir);
  const todayFileName = fileNames[0];
  const yesterdayFileName = fileNames[1];
  const fileDatas = await get_fileData(
    readDir,
    todayFileName,
    yesterdayFileName
  );
  const ids = get_and_add_ids(fileNames, fileDatas, "RACH");
  const todayData = fileDatas[todayFileName];
  const yesterdayData = fileDatas[yesterdayFileName];
  const columns = [col_RACH_1];
  const result = await get_result(
    ids,
    todayData,
    yesterdayData,
    columns,
    "RACH"
  );
  const ngDatas = resultFilter(result, dc_conf, "RACH");
  const outputPath = `${Dir_conf.output}/RACH_output_${formatted}.json`;
  await fs.writeFile(outputPath, JSON.stringify(ngDatas, null, 2));
  console.log(JSON.stringify(ngDatas, null, 2));
};

const Throughput_func = async () => {
  const readDir = Dir_conf.Throughput;
  const fileNames = await get_fileNames(readDir);
  const todayFileName = fileNames[0];
  const yesterdayFileName = fileNames[1];
  const fileDatas = await get_fileData(
    readDir,
    todayFileName,
    yesterdayFileName
  );
  const ids = await get_and_add_ids(fileNames, fileDatas, "Throughput");
  const todayData = fileDatas[todayFileName];
  const yesterdayData = fileDatas[yesterdayFileName];
  const columns = [col_Throughput_1, col_Throughput_2];
  const result = await get_result(
    ids,
    todayData,
    yesterdayData,
    columns,
    "Throughput"
  );
  const ngDatas = resultFilter(result, dc_conf, "Throughput");
  const outputPath = `${Dir_conf.output}/Throughput_output_${formatted}.json`;
  await fs.writeFile(outputPath, JSON.stringify(ngDatas, null, 2));
  console.log(JSON.stringify(ngDatas, null, 2));
};

const VoLTE_func = async () => {
  const readDir = Dir_conf.VoLTE;
  const fileNames = await get_fileNames(readDir);
  const todayFileName = fileNames[0];
  const yesterdayFileName = fileNames[1];
  const fileDatas = await get_fileData(
    readDir,
    todayFileName,
    yesterdayFileName
  );
  const ids = get_and_add_ids(fileNames, fileDatas, "VoLTE");
  const todayData = fileDatas[todayFileName];
  const yesterdayData = fileDatas[yesterdayFileName];
  const columns = [col_VoLTE_1, col_VoLTE_2];
  const result = await get_result(
    ids,
    todayData,
    yesterdayData,
    columns,
    "VoLTE"
  );
  const ngDatas = resultFilter(result, dc_conf, "VoLTE");
  const outputPath = `${Dir_conf.output}/VoLTE_output_${formatted}.json`;
  await fs.writeFile(outputPath, JSON.stringify(ngDatas, null, 2));
  console.log(JSON.stringify(ngDatas, null, 2));
};

const resultFilter = (result, dc, mode) => {
  const id_1 = mode == "RACH" ? "RNC ID" : "MRBTS ID";
  const id_2 = mode == "RACH" ? "WBTS ID" : "LNCEL ID";
  let ngDatas = [];
  const colums = Object.keys(result);
  for (col of colums) {
    const ids = Object.keys(result[col]);
    for (id of ids) {
      if (result[col][id]["dc"] >= dc) {
        const idvals = id.split("_");
        let ngData = {
          KPI名: col,
          today: result[col][id]["today"],
          yesterday: result[col][id]["yesterday"],
          deterioration_count: result[col][id]["dc"],
        };
        ngData[id_1] = idvals[0];
        ngData[id_2] = idvals[1];
        ngDatas.push(ngData);
      }
    }
  }
  return ngDatas;
};

const main = async () => {
  const execFlag_VoLTE = conf.execFlag.VoLTE;
  const execFlag_Throughput = conf.execFlag.Throughput;
  const execFlag_RACH = conf.execFlag.RACH;
  if (execFlag_VoLTE) {
    console.log("#### VoLTE STRAT #####");
    await VoLTE_func()
      .then(() => {
        console.log("#### VoLTE END #####");
      })
      .catch((err) => {
        console.log("!!!! VoLTE ERRER !!!!");
        console.log(err);
      });
  }
  if (execFlag_Throughput) {
    console.log("#### Throughput STRAT #####");
    await Throughput_func()
      .then(() => {
        console.log("#### Throughput END #####");
      })
      .catch((err) => {
        console.log("!!!! Throughput ERRER !!!!");
        console.log(err);
      });
  }
  if (execFlag_RACH) {
    console.log("#### RACH STRAT #####");
    await RACH_func()
      .then(() => {
        console.log("#### RACH END #####");
      })
      .catch((err) => {
        console.log("!!!! RACH ERRER !!!!");
        console.log(err);
      });
  }
};

main()
  .then(() => {
    console.log("end");
  })
  .catch((err) => {
    console.log("err...");
    console.log(err);
  });
