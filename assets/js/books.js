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
 *   cover        : 封面图片 URL
 *   available    : 是否可在线阅读（true 则点击打开阅读器）
 *   format       : 阅读格式 'epub' | 'txt' | 'pdf'（pdf = 按 OCR 页面阅读，file 指向按页 JSON）
 *   file         : 文件路径（available=true 时必填）
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
        cover: 'assets/img/books/cover-wenti-zhonghua-dark.png',
        available: true,
        format: 'epub',
        file: 'books/wentixueyanjiu.epub?v=20260815b',
    },
    {
        id: 'wenti-xingtai-3',
        title: '中国古代文体形态研究',
        subtitle: '第三版',
        author: '吴承学',
        publisher: '北京大学出版社',
        year: '2013',
        isbn: '978-7-301-23267-5',
        tags: ['文体形态', '文体学', '古代文学', '中国古代', '学术', '北京大学出版社'],
        summary: '从形态学角度系统考察中国古代文体的生成、演变与定型，是文体学研究的标志性成果。第三版由北京大学出版社出版。',
        cover: 'assets/img/books/cover-xingtai-3.png',
        available: true,
        format: 'txt',
        file: 'texts/xingtai-3.txt?v=20260815b',
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
        cover: 'assets/img/books/cover-binghu.png',
        available: true,
        format: 'epub',
        file: 'books/binghuqiuyue.epub?v=20260815b',
    },
    {
        id: 'zhi-yong-shen-xia',
        title: '旨永神遥明小品',
        subtitle: '——千锤百炼文人的爱慕与赞美',
        author: '吴承学',
        publisher: '山西人民出版社',
        year: '',
        isbn: '',
        tags: ['小品文', '明代', '晚明', '文学史', '古代散文', '旨永神遐', '明小品'],
        summary: '聚焦明代小品文这一特殊文体的艺术特征与文化意涵，论述其"旨永神遐"的美学追求。',
        cover: 'assets/img/books/cover-mingxiaopin.png',
        available: true,
        format: 'txt',
        file: 'texts/zhiyongshenxia.txt',
    },
    {
        id: 'wenti-xueshi-1',
        title: '中国古代文体学史',
        subtitle: '第一卷 · 先秦两汉文体学史',
        author: '吴承学 李冠兰 著',
        publisher: '北京大学出版社',
        year: '2024',
        isbn: '978-7-301-35474-2',
        tags: ['文体学', '文体学史', '先秦', '两汉', '文体', '古代文学', '学术', '中国古代文体学'],
        summary: '本卷为《中国古代文体学史》第一卷，系统考察先秦两汉时期中国文体学发生、发展的内部动因、形态特征与演变规律，兼采传世文献与出土文献，勾勒早期文体观念的发生与文体学的滥觞。',
        cover: 'assets/img/books/cover-xianqin-removebg-preview.png',
        available: true,
        format: 'pdf',
        file: 'texts/xianqin-parts/manifest.json?v=20260904',
        ocr: 'texts/xianqin-wenti-xueshi.json?v=20260904',
    },
];
