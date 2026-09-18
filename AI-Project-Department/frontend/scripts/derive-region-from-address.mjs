#!/usr/bin/env node
// 从企业名称/地址文本反向解析 region.province/city/district，
// 给新链数据里 region 全空的企业补上最低限度的省/市/区，使地图筛选能命中。
//
// 触发原因：电力/生物医药/AI 新链的源表几乎不填 region，点击「上海」按钮后
//  visibleCompanies 过滤掉所有 province='' 的企业 → 看不到任何标记。
//
// 仅原地修改 public/data/industries/companies-{power,biomed,ai}.json，
// 并刷新顶层 index.json 的 generatedAt。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'public', 'data', 'industries');

// 行政地名集合（按长度倒排，便于优先匹配更具体的地名）。
const PROVINCES = [
  '新疆维吾尔自治区', '内蒙古自治区', '广西壮族自治区', '宁夏回族自治区',
  '西藏自治区', '香港特别行政区', '澳门特别行政区',
  '北京市', '上海市', '天津市', '重庆市',
  '河北省', '山西省', '辽宁省', '吉林省', '黑龙江省',
  '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省',
  '湖北省', '湖南省', '广东省', '海南省', '四川省', '贵州省', '云南省',
  '陕西省', '甘肃省', '青海省', '台湾省',
];

const DIRECT_MUNICIPALITIES = {
  北京市: ['东城区', '西城区', '朝阳区', '海淀区', '丰台区', '石景山区', '门头沟区', '房山区', '通州区', '顺义区', '昌平区', '大兴区', '怀柔区', '平谷区', '密云区', '延庆区'],
  上海市: ['浦东新区', '黄浦区', '徐汇区', '长宁区', '静安区', '普陀区', '虹口区', '杨浦区', '闵行区', '宝山区', '嘉定区', '金山区', '松江区', '青浦区', '奉贤区', '崇明区'],
  天津市: ['和平区', '河东区', '河西区', '南开区', '河北区', '红桥区', '东丽区', '西青区', '津南区', '北辰区', '武清区', '宝坻区', '滨海新区', '宁河区', '静海区', '蓟州区'],
  重庆市: ['渝中区', '大渡口区', '江北区', '沙坪坝区', '九龙坡区', '南岸区', '北碚区', '渝北区', '巴南区'],
};

// 直辖市以外的所有区县级名（精简自公开数据，避免误匹配「开发」之类）。
const NON_MUNI_DISTRICTS = [
  // 江苏省
  '玄武区', '秦淮区', '建邺区', '鼓楼区', '栖霞区', '雨花台区', '江宁区', '六合区', '溧水区', '高淳区',
  '梁溪区', '锡山区', '惠山区', '滨湖区', '新吴区', '江阴市', '宜兴市',
  '鼓楼区', '云龙区', '贾汪区', '泉山区', '铜山区', '新沂市', '邳州市', '溧阳市', '常熟市', '张家港市', '昆山市', '太仓市', '南通市', '连云港市', '淮安市', '盐城市', '扬州市', '镇江市', '泰州市', '宿迁市',
  '姑苏区', '虎丘区', '吴中区', '相城区', '吴江区',
  // 浙江省
  '上城区', '拱墅区', '西湖区', '滨江区', '萧山区', '余杭区', '临平区', '钱塘区', '富阳区', '临安区', '桐庐县', '淳安县', '建德市', '慈溪市', '余姚市', '奉化区', '象山县', '宁海县', '鹿城区', '龙湾区', '瓯海区', '洞头区', '永嘉县', '平阳县', '苍南县', '龙港市', '瑞安市', '乐清市', '海曙区', '江北区', '镇海区', '北仑区', '鄞州区', '奉化区', '象山县', '宁海县', '余姚市', '慈溪市',
  // 广东省
  '荔湾区', '越秀区', '海珠区', '天河区', '白云区', '黄埔区', '番禺区', '花都区', '南沙区', '从化区', '增城区',
  '福田区', '罗湖区', '盐田区', '南山区', '宝安区', '龙岗区', '龙华区', '坪山区', '光明区', '大鹏新区',
  // 山东省 / 河南 / 湖北 / 湖南 / 安徽 / 福建 / 江西 等省略，仅列高频
];

function sortByLen(a, b) {
  return b.length - a.length;
}

const PROVINCE_SET = new Set(PROVINCES);
const PROVINCE_SHORT = new Map([
  ['北京', '北京市'],
  ['上海', '上海市'],
  ['天津', '天津市'],
  ['重庆', '重庆市'],
  // 也兼容「内蒙古/广西/西藏/宁夏/新疆/香港/澳门」的简称匹配
  ['内蒙古', '内蒙古自治区'],
  ['广西', '广西壮族自治区'],
  ['西藏', '西藏自治区'],
  ['宁夏', '宁夏回族自治区'],
  ['新疆', '新疆维吾尔自治区'],
]);
const DISTRICTS_DIRECT_MUNI = new Map();
for (const [m, ds] of Object.entries(DIRECT_MUNICIPALITIES)) {
  DISTRICTS_DIRECT_MUNI.set(m, new Set(ds));
}

// 收集所有可能作为「直辖市下辖区」和「区县级」的地名。
const NON_MUNI_DISTRICT_SET = new Set(NON_MUNI_DISTRICTS);

// 「XX市」（地级市）候选。直辖市外需要知道每个市的归属省，这里仅给少量常见映射。
const CITY_TO_PROVINCE = {
  '北京市': '北京市', '上海市': '上海市', '天津市': '天津市', '重庆市': '重庆市',
  '石家庄市': '河北省', '唐山市': '河北省', '秦皇岛市': '河北省', '邯郸市': '河北省', '邢台市': '河北省', '保定市': '河北省', '张家口市': '河北省', '承德市': '河北省', '沧州市': '河北省', '廊坊市': '河北省', '衡水市': '河北省',
  '太原市': '山西省', '大同市': '山西省', '阳泉市': '山西省', '长治市': '山西省', '晋城市': '山西省', '朔州市': '山西省', '晋中市': '山西省', '运城市': '山西省', '忻州市': '山西省', '临汾市': '山西省', '吕梁市': '山西省',
  '呼和浩特市': '内蒙古自治区', '包头市': '内蒙古自治区', '乌海市': '内蒙古自治区', '赤峰市': '内蒙古自治区', '通辽市': '内蒙古自治区', '鄂尔多斯市': '内蒙古自治区', '呼伦贝尔市': '内蒙古自治区', '巴彦淖尔市': '内蒙古自治区', '乌兰察布市': '内蒙古自治区', '兴安盟': '内蒙古自治区', '锡林郭勒盟': '内蒙古自治区', '阿拉善盟': '内蒙古自治区',
  '沈阳市': '辽宁省', '大连市': '辽宁省', '鞍山市': '辽宁省', '抚顺市': '辽宁省', '本溪市': '辽宁省', '丹东市': '辽宁省', '锦州市': '辽宁省', '营口市': '辽宁省', '阜新市': '辽宁省', '辽阳市': '辽宁省', '盘锦市': '辽宁省', '铁岭市': '辽宁省', '朝阳市': '辽宁省', '葫芦岛市': '辽宁省',
  '长春市': '吉林省', '吉林市': '吉林省', '四平市': '吉林省', '辽源市': '吉林省', '通化市': '吉林省', '白山市': '吉林省', '松原市': '吉林省', '白城市': '吉林省', '延边朝鲜族自治州': '吉林省',
  '哈尔滨市': '黑龙江省', '齐齐哈尔市': '黑龙江省', '鸡西市': '黑龙江省', '鹤岗市': '黑龙江省', '双鸭山市': '黑龙江省', '大庆市': '黑龙江省', '伊春市': '黑龙江省', '佳木斯市': '黑龙江省', '七台河市': '黑龙江省', '牡丹江市': '黑龙江省', '黑河市': '黑龙江省', '绥化市': '黑龙江省', '大兴安岭地区': '黑龙江省',
  '南京市': '江苏省', '无锡市': '江苏省', '徐州市': '江苏省', '常州市': '江苏省', '苏州市': '江苏省', '南通市': '江苏省', '连云港市': '江苏省', '淮安市': '江苏省', '盐城市': '江苏省', '扬州市': '江苏省', '镇江市': '江苏省', '泰州市': '江苏省', '宿迁市': '江苏省',
  '杭州市': '浙江省', '宁波市': '浙江省', '温州市': '浙江省', '嘉兴市': '浙江省', '湖州市': '浙江省', '绍兴市': '浙江省', '金华市': '浙江省', '衢州市': '浙江省', '舟山市': '浙江省', '台州市': '浙江省', '丽水市': '浙江省',
  '合肥市': '安徽省', '芜湖市': '安徽省', '蚌埠市': '安徽省', '淮南市': '安徽省', '马鞍山市': '安徽省', '淮北市': '安徽省', '铜陵市': '安徽省', '安庆市': '安徽省', '黄山市': '安徽省', '滁州市': '安徽省', '阜阳市': '安徽省', '宿州市': '安徽省', '六安市': '安徽省', '亳州市': '安徽省', '池州市': '安徽省', '宣城市': '安徽省',
  '福州市': '福建省', '厦门市': '福建省', '莆田市': '福建省', '三明市': '福建省', '泉州市': '福建省', '漳州市': '福建省', '南平市': '福建省', '龙岩市': '福建省', '宁德市': '福建省',
  '南昌市': '江西省', '景德镇市': '江西省', '萍乡市': '江西省', '九江市': '江西省', '新余市': '江西省', '鹰潭市': '江西省', '赣州市': '江西省', '吉安市': '江西省', '宜春市': '江西省', '抚州市': '江西省', '上饶市': '江西省',
  '济南市': '山东省', '青岛市': '山东省', '淄博市': '山东省', '枣庄市': '山东省', '东营市': '山东省', '烟台市': '山东省', '潍坊市': '山东省', '济宁市': '山东省', '泰安市': '山东省', '威海市': '山东省', '日照市': '山东省', '临沂市': '山东省', '德州市': '山东省', '聊城市': '山东省', '滨州市': '山东省', '菏泽市': '山东省',
  '郑州市': '河南省', '开封市': '河南省', '洛阳市': '河南省', '平顶山市': '河南省', '安阳市': '河南省', '鹤壁市': '河南省', '新乡市': '河南省', '焦作市': '河南省', '濮阳市': '河南省', '许昌市': '河南省', '漯河市': '河南省', '三门峡市': '河南省', '南阳市': '河南省', '商丘市': '河南省', '信阳市': '河南省', '周口市': '河南省', '驻马店市': '河南省', '济源市': '河南省',
  '武汉市': '湖北省', '黄石市': '湖北省', '十堰市': '湖北省', '宜昌市': '湖北省', '襄阳市': '湖北省', '鄂州市': '湖北省', '荆门市': '湖北省', '孝感市': '湖北省', '荆州市': '湖北省', '黄冈市': '湖北省', '咸宁市': '湖北省', '随州市': '湖北省', '恩施土家族苗族自治州': '湖北省',
  '长沙市': '湖南省', '株洲市': '湖南省', '湘潭市': '湖南省', '衡阳市': '湖南省', '邵阳市': '湖南省', '岳阳市': '湖南省', '常德市': '湖南省', '张家界市': '湖南省', '益阳市': '湖南省', '郴州市': '湖南省', '永州市': '湖南省', '怀化市': '湖南省', '娄底市': '湖南省', '湘西土家族苗族自治州': '湖南省',
  '广州市': '广东省', '韶关市': '广东省', '深圳市': '广东省', '珠海市': '广东省', '汕头市': '广东省', '佛山市': '广东省', '江门市': '广东省', '湛江市': '广东省', '茂名市': '广东省', '肇庆市': '广东省', '惠州市': '广东省', '梅州市': '广东省', '汕尾市': '广东省', '河源市': '广东省', '阳江市': '广东省', '清远市': '广东省', '东莞市': '广东省', '中山市': '广东省', '潮州市': '广东省', '揭阳市': '广东省', '云浮市': '广东省',
  '海口市': '海南省', '三亚市': '海南省', '三沙市': '海南省', '儋州市': '海南省',
  '成都市': '四川省', '自贡市': '四川省', '攀枝花市': '四川省', '泸州市': '四川省', '德阳市': '四川省', '绵阳市': '四川省', '广元市': '四川省', '遂宁市': '四川省', '内江市': '四川省', '乐山市': '四川省', '南充市': '四川省', '眉山市': '四川省', '宜宾市': '四川省', '广安市': '四川省', '达州市': '四川省', '雅安市': '四川省', '巴中市': '四川省', '资阳市': '四川省', '阿坝藏族羌族自治州': '四川省', '甘孜藏族自治州': '四川省', '凉山彝族自治州': '四川省',
  '昆明市': '云南省', '曲靖市': '云南省', '玉溪市': '云南省', '保山市': '云南省', '昭通市': '云南省', '丽江市': '云南省', '普洱市': '云南省', '临沧市': '云南省', '楚雄彝族自治州': '云南省', '红河哈尼族彝族自治州': '云南省', '文山壮族苗族自治州': '云南省', '西双版纳傣族自治州': '云南省', '大理白族自治州': '云南省', '德宏傣族景颇族自治州': '云南省', '怒江傈僳族自治州': '云南省', '迪庆藏族自治州': '云南省',
  '贵阳市': '贵州省', '六盘水市': '贵州省', '遵义市': '贵州省', '安顺市': '贵州省', '毕节市': '贵州省', '铜仁市': '贵州省', '黔西南布依族苗族自治州': '贵州省', '黔东南苗族侗族自治州': '贵州省', '黔南布依族苗族自治州': '贵州省',
  '西安市': '陕西省', '铜川市': '陕西省', '宝鸡市': '陕西省', '咸阳市': '陕西省', '渭南市': '陕西省', '延安市': '陕西省', '汉中市': '陕西省', '榆林市': '陕西省', '安康市': '陕西省', '商洛市': '陕西省',
  '兰州市': '甘肃省', '嘉峪关市': '甘肃省', '金昌市': '甘肃省', '白银市': '甘肃省', '天水市': '甘肃省', '武威市': '甘肃省', '张掖市': '甘肃省', '平凉市': '甘肃省', '酒泉市': '甘肃省', '庆阳市': '甘肃省', '定西市': '甘肃省', '陇南市': '甘肃省', '临夏回族自治州': '甘肃省', '甘南藏族自治州': '甘肃省',
  '西宁市': '青海省', '海东市': '青海省', '海北藏族自治州': '青海省', '黄南藏族自治州': '青海省', '海南藏族自治州': '青海省', '果洛藏族自治州': '青海省', '玉树藏族自治州': '青海省', '海西蒙古族藏族自治州': '青海省',
  '南宁市': '广西壮族自治区', '柳州市': '广西壮族自治区', '桂林市': '广西壮族自治区', '梧州市': '广西壮族自治区', '北海市': '广西壮族自治区', '防城港市': '广西壮族自治区', '钦州市': '广西壮族自治区', '贵港市': '广西壮族自治区', '玉林市': '广西壮族自治区', '百色市': '广西壮族自治区', '贺州市': '广西壮族自治区', '河池市': '广西壮族自治区', '来宾市': '广西壮族自治区', '崇左市': '广西壮族自治区',
  '拉萨市': '西藏自治区', '日喀则市': '西藏自治区', '昌都市': '西藏自治区', '林芝市': '西藏自治区', '山南市': '西藏自治区', '那曲市': '西藏自治区', '阿里地区': '西藏自治区',
  '银川市': '宁夏回族自治区', '石嘴山市': '宁夏回族自治区', '吴忠市': '宁夏回族自治区', '固原市': '宁夏回族自治区', '中卫市': '宁夏回族自治区',
  '乌鲁木齐市': '新疆维吾尔自治区', '克拉玛依市': '新疆维吾尔自治区', '吐鲁番市': '新疆维吾尔自治区', '哈密市': '新疆维吾尔自治区', '昌吉回族自治州': '新疆维吾尔自治区', '博尔塔拉蒙古自治州': '新疆维吾尔自治区', '巴音郭楞蒙古自治州': '新疆维吾尔自治区', '阿克苏地区': '新疆维吾尔自治区', '克孜勒苏柯尔克孜自治州': '新疆维吾尔自治区', '喀什地区': '新疆维吾尔自治区', '和田地区': '新疆维吾尔自治区', '伊犁哈萨克自治州': '新疆维吾尔自治区', '塔城地区': '新疆维吾尔自治区', '阿勒泰地区': '新疆维吾尔自治区',
};

const CITY_LIST = Object.keys(CITY_TO_PROVINCE).sort(sortByLen);
const DISTRICT_LIST = [
  // 主要是直辖市辖区和非直辖市少量熟区
  ...Array.from(DISTRICTS_DIRECT_MUNI.values()).flatMap((s) => Array.from(s)),
  ...NON_MUNI_DISTRICTS,
];

// 自治州/盟
const AUTONOMOUS = ['延边朝鲜族自治州', '恩施土家族苗族自治州', '湘西土家族苗族自治州', '阿坝藏族羌族自治州', '甘孜藏族自治州', '凉山彝族自治州', '黔东南苗族侗族自治州', '黔南布依族苗族自治州', '黔西南布依族苗族自治州', '楚雄彝族自治州', '红河哈尼族彝族自治州', '文山壮族苗族自治州', '西双版纳傣族自治州', '大理白族自治州', '德宏傣族景颇族自治州', '怒江傈僳族自治州', '迪庆藏族自治州', '临夏回族自治州', '甘南藏族自治州', '海北藏族自治州', '黄南藏族自治州', '海南藏族自治州', '果洛藏族自治州', '玉树藏族自治州', '海西蒙古族藏族自治州', '昌吉回族自治州', '博尔塔拉蒙古自治州', '巴音郭楞蒙古自治州', '克孜勒苏柯尔克孜自治州', '伊犁哈萨克自治州'];
const LEAGUE = ['锡林郭勒盟', '阿拉善盟', '兴安盟'];

// 直辖市的非标准后缀区。
const MUNI_SPECIAL_DISTRICT = /(新城|自由贸易试验区|保税港区|新片区|经济开发区|高新技术产业开发区|开发区|产业园|工业园|科技园|保税区|保税物流园区|出口加工区|综合保税区)$/;

function isDirectMunicipality(name) {
  return PROVINCE_SET.has(name) && Boolean(DIRECT_MUNICIPALITIES[name]);
}

function extractFromText(text) {
  if (!text) return null;
  let province = '';
  let city = '';
  let district = '';
  let consumed = 0;

  // 1. 省级：匹配最长的省级名开头
  for (const p of PROVINCES) {
    if (text.startsWith(p)) {
      province = p;
      consumed = p.length;
      break;
    }
    // 允许前面有「中国」
    if (text.startsWith('中国' + p)) {
      province = p;
      consumed = '中国'.length + p.length;
      break;
    }
  }
  // 兼容简称开头：「上海捍芯半导体设备有限公司」
  if (!province) {
    for (const [short, full] of PROVINCE_SHORT) {
      if (text.startsWith(short) && !text.startsWith(full)) {
        // 规避误命中「内蒙古」之于「内蒙古自治区」
        province = full;
        consumed = short.length;
        break;
      }
    }
  }

  if (!province) {
    // 也许是企业名里的括号：「沐曦集成电路（上海）」
    const bracket = text.match(/[（(]([\u4e00-\u9fa5A-Za-z0-9]{2,15})[)）]/);
    if (bracket) {
      const inner = bracket[1];
      if (PROVINCE_SET.has(inner)) {
        province = inner;
        consumed = 0;
      } else if (DIRECT_MUNICIPALITIES[inner]) {
        province = inner;
        consumed = 0;
      } else if (PROVINCE_SHORT.has(inner)) {
        province = PROVINCE_SHORT.get(inner);
        consumed = 0;
      }
    }
  }

  if (!province) return null;
  const tail = text.slice(consumed);

  if (isDirectMunicipality(province)) {
    // 直辖市：city = 省份本身，从 tail 找 district
    city = province;
    // 优先匹配标准区名
    for (const d of DIRECT_MUNICIPALITIES[province]) {
      if (tail.startsWith(d)) {
        district = d;
        consumed += d.length;
        break;
      }
    }
    if (!district) {
      // 否则抓非标准后缀（自由贸易试验区等）
      const m = tail.match(/^([\u4e00-\u9fa5A-Za-z0-9]{2,15}(?:新城|自由贸易试验区|保税港区|新片区|经济开发区|高新技术产业开发区|开发区|产业园|工业园|科技园|保税区|综合保税区|出口加工区))/);
      if (m) district = m[1];
    }
    return { province, city, district, street: '' };
  }

  // 非直辖市：从 tail 里找 city（最长优先）
  for (const c of CITY_LIST) {
    const owner = CITY_TO_PROVINCE[c];
    if (owner !== province) continue;
    if (tail.startsWith(c)) {
      city = c;
      consumed += c.length;
      break;
    }
  }
  if (!city) {
    // 自治州/盟
    for (const aut of [...AUTONOMOUS, ...LEAGUE]) {
      if (tail.startsWith(aut)) {
        const owner = CITY_TO_PROVINCE[aut];
        if (owner === province) {
          city = aut;
          consumed += aut.length;
          break;
        }
      }
    }
  }
  if (!city) return { province, city: '', district: '', street: '' };

  const sub = text.slice(consumed);
  // 区/县级
  for (const d of DISTRICT_LIST) {
    if (sub.startsWith(d)) {
      district = d;
      break;
    }
  }
  if (!district) {
    // 兜底：抓「区/县/旗」2~12 字前面的字符
    const m = sub.match(/^([\u4e00-\u9fa5A-Za-z0-9]{2,12}(?:区|县|旗))/);
    if (m) {
      // 排除明显是「XXX开发区」「XXX产业园」这种伪区
      const candidate = m[1];
      if (!/(开发区|产业园|工业园|科技园|保税区|保税港区|综合保税区|保税物流园区|出口加工区)$/.test(candidate)) {
        district = candidate;
      }
    }
  }
  return { province, city, district, street: '' };
}

function extractRegion(name, address, existingRegion = {}) {
  const out = {
    province: existingRegion.province || '',
    city: existingRegion.city || '',
    district: existingRegion.district || '',
    street: existingRegion.street || '',
  };
  // 人工智能源表通常只有「所属市」，先用完整城市表补省份，避免把城市信息丢掉。
  if (!out.province && out.city) {
    const city = out.city.endsWith('市') ? out.city : `${out.city}市`;
    out.province = CITY_TO_PROVINCE[out.city] || CITY_TO_PROVINCE[city] || '';
  }
  // 先用名称括号
  const fromName = extractFromText(name);
  if (fromName?.province) {
    if (!out.province) out.province = fromName.province;
    if (!out.city && fromName.city) out.city = fromName.city;
    if (!out.district && fromName.district) out.district = fromName.district;
  }
  if (!out.province) {
    const fromAddr = extractFromText(address);
    if (fromAddr?.province) {
      out.province = fromAddr.province;
      if (!out.city && fromAddr.city) out.city = fromAddr.city;
      if (!out.district && fromAddr.district) out.district = fromAddr.district;
    }
  } else if (fromName?.province && !fromName.city) {
    // 名称括号里有「上海」但没拿到 city，再用地址补 city/district
    const fromAddr = extractFromText(address);
    if (fromAddr?.city) out.city = fromAddr.city;
    if (!out.district && fromAddr?.district) out.district = fromAddr.district;
  }
  return out.province ? out : null;
}

function fixIndustry(file) {
  const full = path.join(dataDir, file);
  const payload = JSON.parse(fs.readFileSync(full, 'utf8'));
  const list = payload.companies || [];
  let fixed = 0;
  for (const c of list) {
    const region = c.region || { province: '', city: '', district: '', street: '' };
    if (region.province && region.city) continue;
    const parsed = extractRegion(c.name, c.address, region);
    if (!parsed) continue;
    const newRegion = {
      province: region.province || parsed.province || '',
      city: region.city || parsed.city || '',
      district: region.district || parsed.district || '',
      street: region.street || parsed.street || '',
    };
    if (
      newRegion.province !== region.province ||
      newRegion.city !== region.city ||
      newRegion.district !== region.district ||
      newRegion.street !== region.street
    ) {
      c.region = newRegion;
      c.regionStatus = '已从地址反向解析';
      fixed += 1;
    }
  }
  if (fixed > 0) fs.writeFileSync(full, `${JSON.stringify(payload)}\n`);
  return { file, total: list.length, fixed };
}

const summary = [
  { key: 'power', file: 'companies-power.json' },
  { key: 'biomed', file: 'companies-biomed.json' },
  { key: 'ai', file: 'companies-ai.json' },
].map(({ file }) => fixIndustry(file));

for (const s of summary) {
  console.log(`${s.file}: ${s.total} 家中修复 ${s.fixed} 家 region`);
}

const indexPath = path.join(dataDir, 'index.json');
const indexPayload = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
indexPayload.generatedAt = new Date().toISOString().slice(0, 10);
fs.writeFileSync(indexPath, `${JSON.stringify(indexPayload, null, 2)}\n`);

export { extractRegion, extractFromText };
