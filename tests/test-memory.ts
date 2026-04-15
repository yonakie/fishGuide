import { messagesToPlainText } from "../src/memory"
import type { UIMessage } from "ai";
import dotenv from "dotenv";
import { getArkModel } from "../src/ai-model";
import {
  buildCompactedMessages,
  shouldCompact,
  THRESHOLD,
  KEEP_RECENT,
  type SummaryCache
} from "../src/memory";
import { performCompaction } from "../src/memory";

dotenv.config({ path: ".dev.vars" });
const arkmodel = getArkModel();


const testmsg = [
    {
        "role": "user",
        "parts": [
            {
                "type": "text",
                "text": "你好"
            }
        ],
        "id": "33DSxsp5YGLlodC5"
    },
    {
        "id": "u60mDcjOztF362Uf",
        "metadata": {
            "finishReason": "stop"
        },
        "role": "assistant",
        "parts": [
            {
                "type": "step-start"
            },
            {
                "type": "text",
                "text": "你好！很高兴见到你！😊\n\n我可以帮你：\n- 🗺️ 规划伦敦的游览路线\n- 📝 为景点生成讲解词\n- 🎧 为景点制作语音解说\n\n有什么我可以帮助你的吗？",
                "state": "done"
            }
        ]
    },
    {
        "role": "user",
        "parts": [
            {
                "type": "text",
                "text": "帮我规划一条从帕丁顿车站到伦敦眼的步行路线，历史时期是维多利亚时代，主题是历史和建筑。途径点不要超过5个。"
            }
        ],
        "id": "WpLzkCdaJsSaIP4b"
    },
    {
        "id": "DyguI92mf6E2jKiB",
        "metadata": {
            "finishReason": "stop"
        },
        "role": "assistant",
        "parts": [
            {
                "type": "step-start"
            },
            {
                "type": "text",
                "text": "好的！我来帮你规划一条从帕丁顿车站到伦敦眼的步行路线，重点介绍维多利亚时代的历史和建筑主题，途经点不超过5个。",
                "state": "done"
            },
            {
                "type": "tool-routePlan",
                "toolCallId": "call_nb16xmxj16drxt24ryy9mp4k",
                "state": "output-available",
                "input": {
                    "start": "Paddington Station",
                    "end": "London Eye",
                    "historical_period": "victorian",
                    "themes": [
                        "social_history",
                        "architecture"
                    ],
                    "max_spots": 5
                },
                "output": {
                    "routeId": "68cade39-0599-4854-9c2a-df48a4a16648",
                    "start": {
                        "name": "Paddington Station",
                        "lat": 51.51629819999999,
                        "lon": -0.1765854
                    },
                    "end": {
                        "name": "London Eye",
                        "lat": 51.5031864,
                        "lon": -0.1195192
                    },
                    "spots": [
                        "St John's Church, Hyde Park",
                        "Ukrainian Catholic Cathedral",
                        "Catholic Church of the Immaculate Conception, Mayfair",
                        "His Majesty's Theatre",
                        "County Hall"
                    ],
                    "totalDistance": "6.0 公里",
                    "totalDuration": "1 小时 25 分钟",
                    "message": "已规划从「Paddington Station」到「London Eye」的步行路线，途经 5 个地标，全程约 6.0 公里，步行约 1 小时 25 分钟。如需为路线地标生成语音导览，请告知。"
                }
            },
            {
                "type": "data-route_event",
                "data": {
                    "kind": "route_planning",
                    "routeId": "68cade39-0599-4854-9c2a-df48a4a16648",
                    "start": "Paddington Station",
                    "end": "London Eye"
                }
            },
            {
                "type": "data-route_event",
                "data": {
                    "kind": "route_searching",
                    "routeId": "68cade39-0599-4854-9c2a-df48a4a16648",
                    "message": "正在搜索沿途地标…"
                }
            },
            {
                "type": "data-route_event",
                "data": {
                    "kind": "route_done",
                    "routeId": "68cade39-0599-4854-9c2a-df48a4a16648",
                    "route": {
                        "startName": "Paddington Station",
                        "startLat": 51.51629819999999,
                        "startLon": -0.1765854,
                        "endName": "London Eye",
                        "endLat": 51.5031864,
                        "endLon": -0.1195192,
                        "spots": [
                            {
                                "name_en": "St John's Church, Hyde Park",
                                "name_zh": "",
                                "lat": 51.5153024,
                                "lon": -0.1684802,
                                "rating": 4.4,
                                "themes": [
                                    "religion",
                                    "architecture",
                                    "social_history"
                                ],
                                "highlight_zh": "圣约翰教堂拥有高耸的内部，融合现代爵士弥撒与传统礼拜，展现多元音乐传统。",
                                "primary_type": "church"
                            },
                            {
                                "name_en": "Ukrainian Catholic Cathedral",
                                "name_zh": "",
                                "lat": 51.5134772,
                                "lon": -0.150663,
                                "rating": 4.9,
                                "themes": [
                                    "religion",
                                    "architecture"
                                ],
                                "highlight_zh": "这座大教堂拥有华丽的镀金祭坛图标，展现了伦敦乌克兰希腊天主教社区的丰富遗产。",
                                "primary_type": "church"
                            },
                            {
                                "name_en": "Catholic Church of the Immaculate Conception, Mayfair",
                                "name_zh": "农场街教堂",
                                "lat": 51.5093755,
                                "lon": -0.14899669999999998,
                                "rating": 4.8,
                                "themes": [
                                    "religion",
                                    "architecture"
                                ],
                                "highlight_zh": "这座教堂拥有令人惊叹的金色祭坛马赛克，展示了维多利亚哥特复兴风格的精美艺术。",
                                "primary_type": "church"
                            },
                            {
                                "name_en": "His Majesty's Theatre",
                                "name_zh": "",
                                "lat": 51.5082429,
                                "lon": -0.13186299999999998,
                                "rating": 4.7,
                                "themes": [
                                    "art",
                                    "literature",
                                    "architecture"
                                ],
                                "highlight_zh": "自1986年以来，His Majesty's Theatre一直上演《歌剧魅影》，成为历史上演出时间最长的剧目之一。",
                                "primary_type": "performing_arts_theater"
                            },
                            {
                                "name_en": "County Hall",
                                "name_zh": "",
                                "lat": 51.5026717,
                                "lon": -0.1194169,
                                "rating": 4.6,
                                "themes": [
                                    "politics",
                                    "architecture"
                                ],
                                "highlight_zh": "County Hall曾是伦敦市议会的总部，数十年来影响着伦敦的治理。",
                                "primary_type": "historical_landmark"
                            }
                        ],
                        "totalDistance": "6.0 公里",
                        "totalDuration": "1 小时 25 分钟",
                        "polyline": "yxlyHrja@jBwCJTPYQ_@EKBGPYZe@d@u@hBuCNSDJPYEM@EMW|@yADADSh@_AGQ[s@oBeEe@gAi@}@Si@SuACs@BoAV?TGC_@@IFGTg@HSJALHBa@?k@Ac@H_@BCNTjAuBH]FKOaBKo@c@}EKwA[iDW_CG[?]?CGJEUDMT]lBiD\\k@?IPY@C@Bf@_ALYH_@Tc@b@o@Vw@JUFc@KeBC]EAS]JM?u@Ca@IgAGaAGs@Bi@Ey@Ic@G{@G}AE@Ae@DCCw@GiBCu@IwBCo@C@Ce@?EDAEs@IuAIe@Ck@Is@E}@GeAAu@CACUBA?GREDA?BVMlBs@XMGm@Fl@`@O`@MdAa@l@WLS`@Qx@YPGd@Ql@ITI?IPG@FNETIhAc@RKZ_@NVx@]BHf@WNPH\\\\pCtAYr@cAEIO]Q]Oa@_@}@JOi@qAe@iAO]@KJITY`@k@TYMQ{@uBjBoCXg@EQ?KBY@[?MHOSw@[_AFU^e@FOHMXSZ_@x@aAQg@JG\\a@L[l@s@PSf@i@n@u@DISi@[w@s@yBSk@IYDCECc@wACCGUFEUe@WiAYgAA[KU[_BQ_Aa@gBcAoEOg@Ki@_AcEEQECG??i@F?f@c@~@w@CMFGBJ`A{@n@i@hA_AROXOT[Gi@iAiEEORQ^[XINS\\YMi@AELKCAK]YiAc@qBOa@Oq@CYBg@DUJMfBk@HENK@Q?q@?YAi@Kk@Kw@JOH_@JJFE?ODUHYH{@HOH}@FcAZ{Cf@}EX}CDc@?U\\oBlAqF~AuH|@oEDS@I\\XH@BCFFFHBP~Ar@XJv@RlAXbC`@tARcBU"
                    }
                }
            },
            {
                "type": "step-start"
            },
            {
                "type": "text",
                "text": "太好了！我为你规划了一条从帕丁顿车站到伦敦眼的步行路线，全程约 **6.0 公里**，步行时间约 **1 小时 25 分钟**。\n\n## 📍 路线概览\n\n**起点：** 帕丁顿车站 (Paddington Station)\n\n**途经点（按顺序）：**\n1. **St John's Church, Hyde Park** - 海德公园圣约翰教堂\n2. **Ukrainian Catholic Cathedral** - 乌克兰天主教堂\n3. **Catholic Church of the Immaculate Conception, Mayfair** - 梅费尔无原罪天主教堂\n4. **His Majesty's Theatre** - 国王剧院\n5. **County Hall** - 郡政厅\n\n**终点：** 伦敦眼 (London Eye)\n\n---\n\n这条路线沿途的景点都带有浓厚的维多利亚时代特色，涵盖了历史和建筑主题。需要我为这些景点生成讲解词或语音导览吗？🎧",
                "state": "done"
            }
        ]
    },
    {
        "id": "pJzkjex7urcK4lUR6RLPQ",
        "role": "assistant",
        "parts": []
    },
    {
        "role": "user",
        "parts": [
            {
                "type": "text",
                "text": "请为以下路线地标生成讲解词：St John's Church, Hyde Park、Ukrainian Catholic Cathedral、Catholic Church of the Immaculate Conception, Mayfair、His Majesty's Theatre、County Hall。路线从Paddington Station出发，终点是London Eye。"
            }
        ],
        "id": "1WGqhCyfJfcYVEAP"
    },
    {
        "id": "8xaCSdapwUeFIxvq",
        "metadata": {
            "finishReason": "stop"
        },
        "role": "assistant",
        "parts": [
            {
                "type": "step-start"
            },
            {
                "type": "text",
                "text": "",
                "state": "done"
            },
            {
                "type": "tool-generateGuideIntros",
                "toolCallId": "call_pm53kpxl00unqyc8xds0d6y4",
                "state": "output-available",
                "input": {
                    "spots": [
                        {
                            "name": "St John's Church, Hyde Park",
                            "historical_period": "victorian",
                            "themes": [
                                "social_history",
                                "architecture"
                            ]
                        },
                        {
                            "name": "Ukrainian Catholic Cathedral",
                            "historical_period": "victorian",
                            "themes": [
                                "social_history",
                                "architecture"
                            ]
                        },
                        {
                            "name": "Catholic Church of the Immaculate Conception, Mayfair",
                            "historical_period": "victorian",
                            "themes": [
                                "social_history",
                                "architecture"
                            ]
                        },
                        {
                            "name": "His Majesty's Theatre",
                            "historical_period": "victorian",
                            "themes": [
                                "social_history",
                                "architecture"
                            ]
                        },
                        {
                            "name": "County Hall",
                            "historical_period": "victorian",
                            "themes": [
                                "social_history",
                                "architecture"
                            ]
                        }
                    ],
                    "requirements": {
                        "length": 500,
                        "style": "生动又不失专业性",
                        "other": "路线从Paddington Station出发，终点是London Eye"
                    }
                },
                "output": {
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spots": [
                        "St John's Church, Hyde Park",
                        "Ukrainian Catholic Cathedral",
                        "Catholic Church of the Immaculate Conception, Mayfair",
                        "His Majesty's Theatre",
                        "County Hall"
                    ],
                    "message": "已完成 St John's Church, Hyde Park、Ukrainian Catholic Cathedral、Catholic Church of the Immaculate Conception, Mayfair、His Majesty's Theatre、County Hall 的讲解词生成，用户可以查阅卡片内容。如果满意，可以调用 generateGuideAudio 为其生成语音。"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "init",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spots": [
                        "St John's Church, Hyde Park",
                        "Ukrainian Catholic Cathedral",
                        "Catholic Church of the Immaculate Conception, Mayfair",
                        "His Majesty's Theatre",
                        "County Hall"
                    ]
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "processing",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "St John's Church, Hyde Park"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "processing",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "Ukrainian Catholic Cathedral"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "processing",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "Catholic Church of the Immaculate Conception, Mayfair"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "processing",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "His Majesty's Theatre"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "processing",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "County Hall"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "done",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "County Hall",
                    "intro": "大家好！欢迎来到美丽的伦敦。今天我们的行程从帕丁顿车站出发，一路向南，穿过繁华的市区，直奔泰晤士河南岸。请大家往窗外看，就在威斯敏斯特大桥旁边，那座气势恢宏、正对着大本钟和议会大厦的建筑，就是我们今天要重点介绍的——郡政厅。这座二级保护建筑曾经是伦敦郡议会的总部，掌管了伦敦整整64年的地方行政大权，见证了无数历史时刻。说到这里，不得不提一个有趣的历史小插曲。当年建筑师为了追求外观的协调，设计了独特的橙色遮阳帘，原本想让它随阳光自动升降，结果系统很快失灵了。遮阳帘开始随机乱动，不仅没能遮挡阳光，反而让里面的办公人员饱受高温和眩光之苦，虽然当时被很多伦敦人吐槽，但现在却被视为早期开放式办公设计的典范。如今，这座曾经严肃的政治中心已经华丽转身，变成了一个充满欢乐的超级娱乐中心。它是默林娱乐的大本营，您不仅能在地下室探访著名的伦敦水族馆，还能体验惊险刺激的伦敦地牢和史莱克冒险。以前这里还举办过星球大战展览，而现在的旧议会厅里，正在上演阿加莎·克里斯蒂的经典话剧《控方证人》。好了，我们的终点站——著名的伦敦眼就在这座建筑旁边耸立着。请大家带好随身物品，准备下车，去体验这座城市的无限魅力吧！"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "done",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "His Majesty's Theatre",
                    "intro": "各位游客朋友们，大家好！欢迎大家从帕丁顿车站出发，开启这段精彩的伦敦文化之旅。随着我们的车轮滚滚向前，我们已经抵达了繁华的海马市场区域。现在，请大家调整呼吸，目光投向街道的这一侧，眼前这座气势恢宏的建筑，正是久负盛名的国王剧院。\n\n这座剧院不仅是伦敦的地标，更承载着厚重的艺术记忆。虽然我们眼前的这座建筑主体是在1892年重建的，但它的前身曾在此屹立了整整180年。当年旧剧院拆除时，人们不仅是在告别砖石，更是在告别一个时代，因为这里曾是《里纳尔多》和《尼伯龙根的指环》等伟大歌剧在英国的首演之地。\n\n让我们仔细欣赏一下它的建筑美学。国王剧院与旁边的卡尔顿酒店是一对完美的双子星，由同一位设计师打造，呈现出对称的法国文艺复兴风格。大家抬头看，建筑上方矗立着巨大的方形穹顶，尽显庄重。剧院正面精美的科林斯柱廊，形成了一个优雅的敞廊，既美观又实用。这种将剧院与酒店通过统一檐口连接的设计，在伦敦的建筑史上也是独树一帜的。\n\n走进剧院内部，您会被那种源自凡尔赛皇家歌剧院的奢华风格所震撼。这里拥有1319个精心设计的座位，而且它的舞台设计非常特别，是英国最早采用平坦设计的舞台之一，为戏剧表演提供了更广阔的空间。\n\n时光荏苒，剧院依然散发着迷人的光彩。好了，各位朋友，关于国王剧院的介绍就到这里。请大家整理好随身物品，我们将继续前往今天的终点站——那座俯瞰泰晤士河的伦敦眼，去感受伦敦的现代脉搏。"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "done",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "Catholic Church of the Immaculate Conception, Mayfair",
                    "intro": "各位游客朋友，大家好！欢迎来到伦敦。我们刚从帕丁顿车站出发，一路穿行，现在抵达了时尚的梅费尔区。请大家跟随我的指引，看向前方这座宏伟的建筑，这就是无原罪始胎天主教堂，当地人更习惯亲切地称它为沃里克街教堂。\n\n这座教堂不仅是宗教场所，更是一座活着的历史博物馆。它的核心结构始建于1790年，最初被称为巴伐利亚皇家礼拜堂。步入其中，大家会发现内部融合了乔治亚风格的装饰与维多利亚时期的修复痕迹。请大家特别留意那金色的祭坛马赛克，这是哥特复兴风格的杰作。著名的建筑师约翰·弗朗西斯·本特利曾在此留下了他的早期印记，尤其是圣母侧祭坛的马赛克人物画，以及模仿早期罗马巴西利卡风格、描绘圣母加冕的圣所，都令人叹为观止。\n\n这座教堂在英国天主教历史上地位极高。著名神学家纽曼主教曾有一句极高的评价，他说如果圣阿塔纳修斯或圣安布罗斯在今天的伦敦，他们不会去圣保罗大教堂，而是会来到沃里克街。这里也见证了无数名流贵胄的悲欢离合。在1936年那场轰动世界的爱德华八世退位危机中，玛丽王后曾在此虔诚祈祷，并坚持每周敬献鲜花直到去世。此外，著名的探险家理查德·伯顿爵士以及小说家伊夫林·沃都曾在这里举行婚礼。\n\n参观完这座充满故事的教堂后，我们将继续前行，前往我们行程的终点——著名的伦敦眼。"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "done",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "St John's Church, Hyde Park",
                    "intro": "大家好，欢迎来到帕丁顿车站！我是大家今天的导游。很高兴能带大家领略伦敦的风采。今天我们的行程将从这里开始，最终前往著名的伦敦眼。首先，请大家跟随我的脚步，穿过繁华的街道，我们要去探访一颗隐藏在闹市中的历史明珠——海德公园的圣约翰教堂。\n\n现在大家脚下的这片区域，被称为海德公园庄园。这是一个非常富裕的住宅区，以其独特的广场和新月形布局而闻名。大家可以看到周围那些优雅的维多利亚式建筑，这里在19世纪时原本归伦敦主教所有，也就是当时的帕丁顿庄园。而我们要看的圣约翰教堂，正是这片社区的核心所在，它静静地矗立在海德公园广场附近，守护着这片土地。\n\n这座教堂不仅建筑精美，更承载着厚重的历史。二战期间，伦敦遭受了猛烈的轰炸，这里也未能幸免。战后，教会专员与建筑公司合作，对受损区域进行了重建和修缮，才让我们今天能看到这样一座保存完好的建筑。\n\n除了建筑，这里的人文故事也相当精彩。大家或许不知道，我们周围的街道可是星光熠熠。就在附近的康纳特广场，英国前首相托尼·布莱尔就曾住在这里。还有著名的奥斯卡影帝迈克尔·凯恩、伟大的文学家萨克雷，以及丘吉尔爵士，都曾是这里的居民。可以说，每一栋房子背后都藏着一段传奇。\n\n好了，听完了这些故事，大家是不是对这里更感兴趣了？参观完圣约翰教堂后，我们将离开这片静谧的富人区，继续向南进发，前往我们今天的终点——伦敦眼。请大家整理好随身物品，我们继续出发！"
                }
            },
            {
                "type": "data-guide_event",
                "data": {
                    "kind": "done",
                    "requestId": "138d69e7-15df-4a8d-b166-682b213ec196",
                    "spotName": "Ukrainian Catholic Cathedral",
                    "intro": "各位游客大家好！欢迎大家来到伦敦。我们现在从帕丁顿车站出发，正一路向著名的伦敦眼行进。在抵达终点之前，我想请大家稍微驻足，看看这座矗立在我们眼前的宏伟建筑——乌克兰天主教大教堂。\n\n这座红砖建筑承载着厚重的历史，它由英国著名建筑师阿尔弗雷德·沃特豪斯于1891年设计。大家注意看它独特的椭圆形中殿和西南角的塔楼，典型的罗马式风格，配上精美的赤陶装饰，显得格外庄重。有趣的是，它最初其实是一座名为国王称重堂的公理会教堂。直到1967年，它才被乌克兰天主教社区购得，并经过内部改造，成为了当地主教府的新家。\n\n作为一座被列为二级保护的建筑，这里不仅有罗伯特·安宁·贝尔设计的彩绘玻璃，还有来自威斯敏斯特大教堂的珍贵告解座。不过，教堂最核心的瑰宝是由乌克兰僧侣尤韦纳利伊·莫克里茨基创作的圣像壁。值得一提的是，2007年教堂曾因天花板坍塌而关闭，但幸运的是，这座圣像壁在事故中完好无损，如今教堂也已修缮完毕。\n\n历经风雨，这里不仅是宗教场所，更是精神灯塔。2013年，教皇本笃十六世将其升格为正式教区。特别是在2022年俄乌冲突期间，这里成为了英国乌克兰社区团结互助的聚集点，许多政要和宗教领袖都曾在此发表演讲。\n\n好了，关于这座大教堂的介绍就到这里。请大家整理好行装，我们继续前往下一个精彩的目的地——伦敦眼！"
                }
            },
            {
                "type": "step-start"
            },
            {
                "type": "text",
                "text": "已为你生成这5个地标的讲解词！📝\n\n讲解词卡片已展示给你，内容重点突出了维多利亚时代的历史和建筑特色，风格生动又不失专业性。\n\n如果你对讲解词满意，我可以为你生成语音导览，方便你在步行时收听。需要我生成语音吗？🎧",
                "state": "done"
            }
        ]
    }
]

// 测试step1：
// const memorymaterial = messagesToPlainText(testmsg as unknown as UIMessage[])
// console.log(memorymaterial)

// 小工具：快速造假消息
function fakeMsg(role: "user" | "assistant", text: string, id?: string): UIMessage {
  return {
    id: id ?? `id_${Math.random().toString(36).slice(2, 8)}`,
    role,
    parts: [{ type: "text", text }]
  } as UIMessage;
}

// ============= step2：shouldCompact 测试 =============
console.log("\n========== shouldCompact ==========");

console.assert(shouldCompact(21) === true, "21 条应触发");
console.assert(shouldCompact(20) === false, "20 条不应触发（> 才触发）");
console.assert(shouldCompact(5) === false, "5 条不应触发");
console.assert(shouldCompact(0) === false, "0 条不应触发");
console.log("✅ shouldCompact 全部通过");

// ============= buildCompactedMessages 测试 =============
console.log("\n========== buildCompactedMessages ==========");

// Case 1: 无 cache → 原样返回
{
  const msgs = [fakeMsg("user", "hello"), fakeMsg("assistant", "hi")];
  const result = buildCompactedMessages(msgs, null);
  console.assert(result.length === 2, "无 cache 应返回原消息");
  console.assert(result[0] === msgs[0], "引用应相同");
  console.log("✅ Case 1: 无 cache 返回原消息");
}

// Case 2: cache.summarizedUpToIndex = 0 → 原样返回
{
  const msgs = [fakeMsg("user", "hello")];
  const cache: SummaryCache = { summaryText: "x", summarizedUpToIndex: 0 };
  const result = buildCompactedMessages(msgs, cache);
  console.assert(result.length === 1, "index=0 应返回原消息");
  console.log("✅ Case 2: index=0 返回原消息");
}

// Case 3: 正常压缩场景 —— 20 条消息，摘要覆盖前 15 条
{
  const msgs = Array.from({ length: 20 }, (_, i) =>
    fakeMsg(i % 2 === 0 ? "user" : "assistant", `msg_${i}`, `id_${i}`)
  );
  const cache: SummaryCache = {
    summaryText: "用户规划了帕丁顿到伦敦眼的路线，routeId=68cade39",
    summarizedUpToIndex: 15
  };
  const result = buildCompactedMessages(msgs, cache);

  console.assert(result.length === 6, `应为 1 摘要 + 5 原 = 6，实际 ${result.length}`);
  console.assert(result[0].role === "user", "第一条应为 user（摘要消息）");
  const firstPart = result[0].parts[0] as any;
  console.assert(
    firstPart.type === "text" && firstPart.text.includes("routeId=68cade39"),
    "摘要消息应包含原摘要文字"
  );
  console.assert(
    (result[1].parts[0] as any).text === "msg_15",
    "第二条应是 msg_15（切点后的第一条）"
  );
  console.assert(
    (result[5].parts[0] as any).text === "msg_19",
    "最后一条应是 msg_19"
  );
  console.log("✅ Case 3: 正常压缩 —— 20 条消息得到 6 条");
}

// Case 4: 越界防御 —— index > messages.length
{
  const msgs = [fakeMsg("user", "hello")];
  const cache: SummaryCache = { summaryText: "x", summarizedUpToIndex: 99 };
  const result = buildCompactedMessages(msgs, cache);
  console.assert(result.length === 1, "越界应退化为原消息");
  console.log("✅ Case 4: 越界防御");
}

// Case 5: 派生是纯函数，不修改入参
{
  const msgs = [fakeMsg("user", "hello"), fakeMsg("assistant", "hi")];
  const original = [...msgs];
  const cache: SummaryCache = { summaryText: "x", summarizedUpToIndex: 1 };
  buildCompactedMessages(msgs, cache);
  console.assert(msgs.length === 2, "入参 msgs 长度不应变");
  console.assert(msgs[0] === original[0], "入参元素引用不应变");
  console.log("✅ Case 5: 纯函数，不修改入参");
}

console.log("\n========== 全部测试通过 ==========");



// 只有显式开启才跑真实 LLM 测试（避免平时跑单测烧 token）
const RUN_LIVE_TEST = process.env.RUN_LIVE_TEST === "1";

if (RUN_LIVE_TEST) {
    if (!process.env.ARK_API_KEY && !process.env.OPENAI_API_KEY) {
        console.log("\n⚠️ 未检测到 ARK_API_KEY / OPENAI_API_KEY，跳过真实 LLM 测试");
        process.exit(0);
    }

  console.log("\n========== performCompaction (真实 LLM) ==========");

  // 建一个临时 model（和 server.ts 里的 arkmodel 一致）

  // 把你之前贴的 7 条真实消息粘进来（或 import）
  const realMessages: UIMessage[] = testmsg as unknown as UIMessage[];

  // —— Case A: 首次压缩 ——
  (async () => {
    console.log("\n--- Case A: 首次压缩（oldCache = null）---");

    // 假装这 7 条是 12 条里的前 7 条（不然 newUpTo 算不出正常值）
    // 为了简化，我们人为把 KEEP_RECENT 当成 2 来模拟真实触发
    // 或者直接调底层逻辑：
    const oldCache = null;
    const mockMessages = realMessages; // 7 条
    // newUpTo = 7 - 5 = 2，只压前 2 条
    const newCache = await performCompaction(arkmodel, mockMessages, oldCache);

    console.log("摘要长度:", newCache.summaryText.length);
    console.log("覆盖到 index:", newCache.summarizedUpToIndex);
    console.log("摘要全文:\n", newCache.summaryText);

    // —— 关键字段验证 ——
    // 如果 newUpTo=2，前 2 条只是"你好/你好+介绍"，没有 routeId
    // 所以这个 case 重点是看生成是否成功、摘要质量如何
  })();

  // —— Case B: 首次压缩（覆盖到含 tool 调用的消息）——
  (async () => {
    console.log("\n--- Case B: 覆盖含 routePlan 工具调用的消息 ---");

    // 手动把 newUpTo 设成 5，覆盖到前 5 条（含 routePlan 和 generateGuideIntros）
    // 做法：临时塞一些假消息让 length 变大
    const padded = [
      ...realMessages,
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `pad_${i}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `padding_${i}` }]
      }))
    ]; // length = 12, newUpTo = 7，覆盖了全部真实消息
    const newCache = await performCompaction(arkmodel, padded, null);

    console.log("摘要全文:\n", newCache.summaryText);
    console.log("\n—— 关键字段检查 ——");

    const checks = [
      { name: "routeId", pattern: /68cade39/, critical: true },
      { name: "requestId", pattern: /138d69e7/, critical: true },
      { name: "起点 Paddington", pattern: /Paddington/i, critical: true },
      { name: "终点 London Eye", pattern: /London Eye/i, critical: true },
      { name: "维多利亚时代", pattern: /维多利亚|victorian/i, critical: true },
      { name: "5 个地标（至少提到其中一个）", pattern: /St John|Ukrainian|Immaculate|Majesty|County Hall/i, critical: true }
    ];

    let failed = 0;
    for (const c of checks) {
      const hit = c.pattern.test(newCache.summaryText);
      console.log(`${hit ? "✅" : "❌"} ${c.name}`);
      if (!hit && c.critical) failed++;
    }

    if (failed === 0) {
      console.log("\n🎉 关键字段全部保留，摘要质量合格");
    } else {
      console.log(`\n⚠️ 有 ${failed} 个关键字段缺失，需要调整 prompt`);
    }
  })();

  // —— Case C: 增量压缩（有旧摘要）——
  (async () => {
    console.log("\n--- Case C: 增量压缩 ---");

    const oldCache: SummaryCache = {
      summaryText: "用户请求规划从 Paddington Station 到 London Eye 的维多利亚时代步行路线，主题为历史和建筑。已调用 routePlan 工具，routeId=68cade39-0599-4854-9c2a-df48a4a16648，途经 St John's Church, Hyde Park 等 5 个地标。",
      summarizedUpToIndex: 4
    };

    // 让 messages.length - KEEP_RECENT > oldUpTo
    // 即 length > 9，用你的 7 条 + 3 条 padding
    const padded = [
      ...realMessages,
      ...Array.from({ length: 3 }, (_, i) => ({
        id: `pad_${i}`,
        role: "user" as const,
        parts: [{ type: "text" as const, text: `padding_${i}` }]
      }))
    ]; // length = 10, newUpTo = 5

    const newCache = await performCompaction(arkmodel, padded, oldCache);

    console.log("新摘要:\n", newCache.summaryText);
    console.log("\n—— 检查旧信息是否还在 ——");
    console.log(`routeId 保留: ${/68cade39/.test(newCache.summaryText) ? "✅" : "❌"}`);
    console.log(`requestId 保留（来自新段落）: ${/138d69e7/.test(newCache.summaryText) ? "✅" : "❌"}`);
  })();
} else {
  console.log("\n💡 设置 RUN_LIVE_TEST=1 来跑 performCompaction 的真实 LLM 测试");
}