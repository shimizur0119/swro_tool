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

const get_and_add_ids = (fileDatas, mode) => {
  let ids = [];
  for (e of fileDatas) {
    if (mode == "RACH") {
      if (e["RNC ID"] && e["WBTS ID"] && e["WCEL ID"]) {
        const ukey = `${e["RNC ID"]}_${e["WBTS ID"]}_${e["WCEL ID"]}`;
        e["ukey"] = ukey;
        e["PERIOD_START_TIME"] = strToDate(e["PERIOD_START_TIME"]);
      } else {
        e["ukey"] = null;
      }
    } else if (mode == "Throughput") {
      if (e["MRBTS ID"] && e["LNCEL ID"]) {
        const ukey = `${e["MRBTS ID"]}_${e["LNCEL ID"]}`;
        e["ukey"] = ukey;
        e["PERIOD_START_TIME"] = strToDate(e["PERIOD_START_TIME"]);
      } else {
        e["ukey"] = null;
      }
    } else if (mode == "VoLTE") {
      if (e["MRBTS ID"] && e["LNCEL ID"]) {
        const ukey = `${e["MRBTS ID"]}_${e["LNCEL ID"]}`;
        e["ukey"] = ukey;
        e["PERIOD_START_TIME"] = strToDate(e["PERIOD_START_TIME"]);
      } else {
        e["ukey"] = null;
      }
    }
    let tmplist = fileDatas.map((e) => {
      if (e["ukey"]) return `${e["ukey"]}`;
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

const strToDate_forConf = (str) => {
  const list = str.split(" ");
  const dl = list[0].split("/");
  const YYYY = dl[0];
  const MM = dl[1];
  const DD = dl[2];
  const tl = list[1].split(":");
  const hh = tl[0];
  const mm = tl[1];
  const ss = tl[2];
  const date = new Date(YYYY, MM, DD, hh, mm, ss);
  return date;
};

const yesterday_check = (todayData, yesterdayDatas, col) => {
  const yesterdayData = yesterdayDatas.find((e) => {
    const y_dt = e["PERIOD_START_TIME"];
    const t_dt = todayData["PERIOD_START_TIME"];
    const y_dt_str_H = y_dt.getHours();
    const y_dt_str_M = y_dt.getMinutes();
    const t_dt_str_H = y_dt.getHours();
    const t_dt_str_M = y_dt.getMinutes();
    const y_dt_str = `${y_dt_str_H}:${y_dt_str_M}`;
    const t_dt_str = `${t_dt_str_H}:${t_dt_str_M}`;
    return y_dt_str === t_dt_str;
  });
  let ng_flag;
  if (yesterdayData[col]) {
    const yd = Number(yesterdayData[col]);
    const yd_under5per = (yd / 100) * 95;
    const yd_over5per = (yd / 100) * 105;
    const td = Number(todayData[col]);
    if (td >= yd_under5per && td <= yd_over5per) {
      ng_flag = false;
    } else {
      ng_flag = true;
    }
  }
  return ng_flag;
};

const get_deteriorationCount = (todayDatas, yesterdayDatas, mode, col) => {
  const TH_conf_VoLTE = conf.setting.Threshold.VoLTE;
  const TH_conf_Throughput = conf.setting.Threshold.Throughput;
  const TH_conf_RACH = conf.setting.Threshold.RACH;
  let count = 0;
  let ng_flag;
  todayDatas.forEach((e) => {
    ng_flag = yesterday_check(e, yesterdayDatas, col);
    if (e[col]) {
      if (mode == "RACH") {
        const value = Number(e[col]);
        if (value <= (TH_conf_RACH.RACH_DENOMI3 / 100) * 1800) {
          if (ng_flag) count += 1;
        }
      } else if (mode == "Throughput") {
        if (col == col_Throughput_1) {
          if (Number(e[col]) < TH_conf_Throughput.QCI_9_DL) {
            if (ng_flag) count += 1;
          }
        } else if (col == col_Throughput_2) {
          if (Number(e[col]) < TH_conf_Throughput.QCI_9_UL) {
            if (ng_flag) count += 1;
          }
        }
      } else if (mode == "VoLTE") {
        if (col == col_VoLTE_1) {
          if (Number(e[col]) < TH_conf_VoLTE.ERAB_SUCCESS_RATIO_QCI_1) {
            if (ng_flag) count += 1;
          }
        } else if (col == col_VoLTE_2) {
          if (Number(e[col]) >= TH_conf_VoLTE.ERAB_DROP_RATIO_QCI_1) {
            if (ng_flag) count += 1;
          }
        }
      }
    }
  });
  return count;
};

const get_fileNames = async (dir) => {
  let fileNames = await fs.readdir(dir);
  return fileNames;
};

const get_fileData = async (dir, fileNames) => {
  let fileDatas = [];
  for (name of fileNames) {
    let data = await fs.readFile(`${dir}/${name}`);
    data = await csvParse(data, csvParseOption);
    fileDatas = fileDatas.concat(data);
  }
  return fileDatas;
};

const get_result = async (ids, fileDatas, columns, mode) => {
  const today_dt = strToDate_forConf(conf.now + ":00");
  const today_end_dt = new Date(
    today_dt.getFullYear(),
    today_dt.getMonth(),
    today_dt.getDate() + 1,
    0,
    0,
    -1
  );
  let yesterday_dt = strToDate_forConf(conf.now + ":00");
  yesterday_dt.setDate(yesterday_dt.getDate() - 1);
  const yesterday_end_dt = new Date(
    yesterday_dt.getFullYear(),
    yesterday_dt.getMonth(),
    yesterday_dt.getDate() + 1,
    0,
    0,
    -1
  );
  let result = {};
  for (col of columns) {
    result[col] = {};
    for (id of ids) {
      result[col][id] = {};
      let needTodayDatas = await fileDatas
        .filter(
          (e) =>
            e["PERIOD_START_TIME"] >= today_dt &&
            e["PERIOD_START_TIME"] <= today_end_dt
        )
        .filter((e) => e["ukey"] == id)
        .filter((e, i, self) => self.indexOf(e) === i && e);
      let needYesterdayDatas = await fileDatas
        .filter(
          (e) =>
            e["PERIOD_START_TIME"] >= yesterday_dt &&
            e["PERIOD_START_TIME"] <= yesterday_end_dt
        )
        .filter((e) => e["ukey"] == id)
        .filter((e, i, self) => self.indexOf(e) === i && e);
      needTodayDatas = get_sortValues(needTodayDatas);
      needYesterdayDatas = get_sortValues(needYesterdayDatas);
      const today_dc = get_deteriorationCount(
        needTodayDatas,
        needYesterdayDatas,
        mode,
        col
      );
      result[col][id]["today"] = needTodayDatas[0][col];
      result[col][id]["yesterday"] = needYesterdayDatas[0][col];
      result[col][id]["dc"] = today_dc;
    }
  }
  return result;
};

const resultFilter = (result, dc, mode) => {
  const id_1 = mode == "RACH" ? "RNC ID" : "MRBTS ID";
  const id_2 = mode == "RACH" ? "WBTS ID" : "LNCEL ID";
  const id_3 = mode == "RACH" ? "WCEL ID" : null;
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
        if (id_3) ngData[id_3] = idvals[2];
        ngDatas.push(ngData);
      }
    }
  }
  return ngDatas;
};

const RACH_func = async () => {
  const readDir = Dir_conf.RACH;
  const fileNames = await get_fileNames(readDir);
  // console.log(JSON.stringify(fileNames, null, 2));
  const fileDatas = await get_fileData(readDir, fileNames);
  // console.log(JSON.stringify(fileDatas, null, 2));
  const ids = get_and_add_ids(fileDatas, "RACH");
  // console.log(JSON.stringify(ids, null, 2));
  const columns = [col_RACH_1];
  const result = await get_result(ids, fileDatas, columns, "RACH");
  // console.log(JSON.stringify(result, null, 2));
  const ngDatas = resultFilter(result, dc_conf, "RACH");
  const outputPath = `${Dir_conf.output}/RACH_output_${formatted}.json`;
  await fs.writeFile(outputPath, JSON.stringify(ngDatas, null, 2));
  console.log(JSON.stringify(ngDatas, null, 2));
};

const Throughput_func = async () => {
  const readDir = Dir_conf.Throughput;
  const fileNames = await get_fileNames(readDir);
  // console.log(JSON.stringify(fileNames, null, 2));
  const fileDatas = await get_fileData(readDir, fileNames);
  // console.log(JSON.stringify(fileDatas, null, 2));
  const ids = get_and_add_ids(fileDatas, "Throughput");
  // console.log(JSON.stringify(ids, null, 2));
  const columns = [col_Throughput_1, col_Throughput_2];
  const result = await get_result(ids, fileDatas, columns, "Throughput");
  // console.log(JSON.stringify(result, null, 2));
  const ngDatas = resultFilter(result, dc_conf, "Throughput");
  const outputPath = `${Dir_conf.output}/Throughput_output_${formatted}.json`;
  await fs.writeFile(outputPath, JSON.stringify(ngDatas, null, 2));
  console.log(JSON.stringify(ngDatas, null, 2));
};

const VoLTE_func = async () => {
  const readDir = Dir_conf.VoLTE;
  const fileNames = await get_fileNames(readDir);
  // console.log(JSON.stringify(fileNames, null, 2));
  const fileDatas = await get_fileData(readDir, fileNames);
  // console.log(JSON.stringify(fileDatas, null, 2));
  const ids = get_and_add_ids(fileDatas, "VoLTE");
  // console.log(JSON.stringify(ids, null, 2));
  const columns = [col_VoLTE_1, col_VoLTE_2];
  const result = await get_result(ids, fileDatas, columns, "VoLTE");
  // console.log(JSON.stringify(result, null, 2));
  const ngDatas = resultFilter(result, dc_conf, "VoLTE");
  const outputPath = `${Dir_conf.output}/VoLTE_output_${formatted}.json`;
  await fs.writeFile(outputPath, JSON.stringify(ngDatas, null, 2));
  console.log(JSON.stringify(ngDatas, null, 2));
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
