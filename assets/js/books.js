/**
 * 吴承学著作文库 - 书籍数据
 *
 * 字段说明：
 *   id           : 唯一标识
 *   title        : 书名
 *   subtitle     : 副标题（可选）
 *   author       : 作者
 *   publisher    : 出版社
 *   year         : 出版年份
 *   isbn         : ISBN
 *   tags         : 关键词标签（用于搜索匹配 & 卡片分类）
 *   summary      : 简介
 *   cover        : 封面图片 URL（无则使用占位配色）
 *   coverStyle   : 占位封面的配色 (top / bottom)
 *   available    : 是否可在线阅读（true 则点击打开 EPUB 阅读器）
 *   epub         : EPUB 文件路径（available=true 时必填）
 *
 * 注意：
 *   本数据集只把已上传到 public/assets 的《中国古代文体学研究》标记为 available。
 *   其余书目仅作为"著作目录"展示，方便检索/浏览；点击提示"敬请期待"。
 */

window.WCX_BOOKS = [
    {
        id: 'wenti-xue-yanjiu',
        title: '中国古代文体学研究',
        subtitle: '中华学术·有道',
        author: '吴承学',
        publisher: '中华书局',
        year: '2024',
        isbn: '9787101166927',
        tags: ['文体学', '辨体', '古代文学', '总集', '诗文评', '中国古代', '学术', '中国古代文体学'],
        summary: '本书系吴承学教授关于中国古代文体学研究的代表性论集，系统梳理了中国古代文体学的学科内涵、要籍叙录与基本研究方法。',
        cover: 'covers/cover1.jpg',
        available: true,
        epub: 'books/wentixueyanjiu.epub',
    },
    {
        id: 'zhi-yong-shen-xia',
        title: '旨永神遐明小品',
        subtitle: '——千锤百炼文人的爱慕与赞美',
        author: '吴承学',
        publisher: '山西人民出版社',
        year: '',
        isbn: '',
        tags: ['小品文', '明代', '晚明', '文学史', '古代散文', '旨永神遐', '明小品'],
        summary: '聚焦明代小品文这一特殊文体的艺术特征与文化意涵，论述其"旨永神遐"的美学追求。',
        cover: '',
        coverStyle: { top: '#d9d4c4', bottom: '#a8a092' },
        available: false,
        epub: '',
    },
    {
        id: 'gudian-wenxue-wenti',
        title: '中国古典文学文体研究',
        author: '吴承学',
        publisher: '',
        year: '',
        isbn: '',
        tags: ['古典文学', '文体', '文学研究', '古代文学', '文体研究'],
        summary: '对中国古典文学各类文体形态、源流与功能的综合性研究。',
        cover: '',
        coverStyle: { top: '#3f6555', bottom: '#284238' },
        available: false,
        epub: '',
    },
    {
        id: 'wenti-xingtai-zengding',
        title: '中国古代文体形态研究',
        subtitle: '（含增订本）',
        author: '吴承学',
        publisher: '商务印书馆',
        year: '',
        isbn: '',
        tags: ['文体形态', '文体学', '古代文学', '中国古代', '学术'],
        summary: '从形态学角度系统考察中国古代文体的生成、演变与定型，是文体学研究的标志性成果。',
        cover: '',
        coverStyle: { top: '#7da4be', bottom: '#456c87' },
        available: false,
        epub: '',
    },
    {
        id: 'wanming-xiaopin',
        title: '晚明小品研究',
        author: '吴承学',
        publisher: '北京大学出版社',
        year: '',
        isbn: '',
        tags: ['小品文', '晚明', '明代', '文学史', '古代散文'],
        summary: '系统研究晚明小品文的文体特征、创作群体与文化背景，揭示其文学史意义。',
        cover: '',
        coverStyle: { top: '#a8b59c', bottom: '#6f8064' },
        available: false,
        epub: '',
    },
    {
        id: 'binghu-qiuyue',
        title: '冰壶秋月',
        author: '吴承学',
        publisher: '',
        year: '',
        isbn: '',
        tags: ['散文', '随笔', '序跋', '学术随笔', '冰壶秋月'],
        summary: '吴承学教授的学术随笔集，融学术情思与人生感怀，文笔清雅，意味深长。',
        cover: '',
        coverStyle: { top: '#c4a874', bottom: '#8a6e3c' },
        available: false,
        epub: '',
    },
    {
        id: 'xianqin-lianghan',
        title: '先秦两汉文学史',
        subtitle: '（与陈引驰主编）',
        author: '吴承学',
        publisher: '北京大学出版社',
        year: '',
        isbn: '',
        tags: ['文学史', '先秦', '两汉', '古代文学', '断代史'],
        summary: '先秦两汉文学的断代史著作，叙述该时段文学的演进与代表作品。',
        cover: '',
        coverStyle: { top: '#c7b48b', bottom: '#8a7548' },
        available: false,
        epub: '',
    },
    {
        id: 'wen-ti shi shi',
        title: '中国古代文体诗史',
        author: '吴承学',
        publisher: '',
        year: '',
        isbn: '',
        tags: ['文体', '诗史', '古代文学', '学术', '文体诗史'],
        summary: '以文体为纬、以史为经，纵观中国古代诗体的演变轨迹。',
        cover: '',
        coverStyle: { top: '#caa37a', bottom: '#7e5832' },
        available: false,
        epub: '',
    },
    {
        id: 'wuchengxue-zixuanji',
        title: '吴承学自选集',
        author: '吴承学',
        publisher: '',
        year: '',
        isbn: '',
        tags: ['自选集', '学术', '文集', '序跋'],
        summary: '吴承学教授自选学术文集，集中体现其多年治学路径与代表性观点。',
        cover: '',
        coverStyle: { top: '#d8c8b0', bottom: '#a08a6a' },
        available: false,
        epub: '',
    },
];