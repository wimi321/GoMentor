export type UiLocale = 'zh-CN' | 'en-US' | 'ja-JP' | 'ko-KR' | 'th-TH' | 'vi-VN'

export const SUPPORTED_UI_LOCALES: Array<{ value: UiLocale; label: string }> = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
  { value: 'ko-KR', label: '한국어' },
  { value: 'th-TH', label: 'ไทย' },
  { value: 'vi-VN', label: 'Tiếng Việt' }
]

export function normalizeUiLocale(value: unknown): UiLocale {
  if (value === 'en-US' || value === 'ja-JP' || value === 'ko-KR' || value === 'th-TH' || value === 'vi-VN') return value
  return 'zh-CN'
}

type TranslationKey =
  | 'taskFailed'
  | 'unknownError'
  | 'settingsSaved'
  | 'benchmarkStarting'
  | 'benchmarkFailed'
  | 'katagoInstallPreparing'
  | 'katagoInstallFailed'
  | 'languageLabel'
  | 'languageHelp'
  | 'reviewLanguage'
  | 'teacherLanguage'

const DICT: Record<UiLocale, Record<TranslationKey, string>> = {
  'zh-CN': {
    taskFailed: '任务失败',
    unknownError: '未知错误',
    settingsSaved: '配置已保存',
    benchmarkStarting: '正在调用 KataGo 官方 benchmark，通常需要几十秒。',
    benchmarkFailed: 'KataGo 测速失败',
    katagoInstallPreparing: '正在准备 KataGo 官方权重安装。',
    katagoInstallFailed: 'KataGo 官方权重安装失败',
    languageLabel: '界面语言',
    languageHelp: '同时影响 AI 老师默认讲解语言和错误提示语言。',
    reviewLanguage: '复盘语言',
    teacherLanguage: 'AI 老师语言'
  },
  'en-US': {
    taskFailed: 'Task failed',
    unknownError: 'Unknown error',
    settingsSaved: 'Settings saved',
    benchmarkStarting: 'Running the official KataGo benchmark. This usually takes a few dozen seconds.',
    benchmarkFailed: 'KataGo benchmark failed',
    katagoInstallPreparing: 'Preparing the official KataGo model install.',
    katagoInstallFailed: 'KataGo official model install failed',
    languageLabel: 'Interface language',
    languageHelp: 'Also controls the default AI teacher language and error messages.',
    reviewLanguage: 'Review language',
    teacherLanguage: 'AI teacher language'
  },
  'ja-JP': {
    taskFailed: 'タスクに失敗しました',
    unknownError: '不明なエラー',
    settingsSaved: '設定を保存しました',
    benchmarkStarting: 'KataGo 公式ベンチマークを実行しています。通常は数十秒かかります。',
    benchmarkFailed: 'KataGo ベンチマークに失敗しました',
    katagoInstallPreparing: 'KataGo 公式モデルのインストールを準備しています。',
    katagoInstallFailed: 'KataGo 公式モデルのインストールに失敗しました',
    languageLabel: '表示言語',
    languageHelp: 'AI 先生の既定言語とエラーメッセージにも反映されます。',
    reviewLanguage: '復習言語',
    teacherLanguage: 'AI 先生の言語'
  },
  'ko-KR': {
    taskFailed: '작업 실패',
    unknownError: '알 수 없는 오류',
    settingsSaved: '설정을 저장했습니다',
    benchmarkStarting: '공식 KataGo 벤치마크를 실행하는 중입니다. 보통 수십 초가 걸립니다.',
    benchmarkFailed: 'KataGo 벤치마크 실패',
    katagoInstallPreparing: '공식 KataGo 모델 설치를 준비하는 중입니다.',
    katagoInstallFailed: 'KataGo 공식 모델 설치 실패',
    languageLabel: '인터페이스 언어',
    languageHelp: 'AI 선생님의 기본 해설 언어와 오류 메시지에도 적용됩니다.',
    reviewLanguage: '복기 언어',
    teacherLanguage: 'AI 선생님 언어'
  },
  'th-TH': {
    taskFailed: 'งานล้มเหลว',
    unknownError: 'ข้อผิดพลาดไม่ทราบสาเหตุ',
    settingsSaved: 'บันทึกการตั้งค่าแล้ว',
    benchmarkStarting: 'กำลังรัน benchmark KataGo อย่างเป็นทางการ ซึ่งมักใช้เวลาหลายสิบวินาที',
    benchmarkFailed: 'ทดสอบ KataGo ไม่สำเร็จ',
    katagoInstallPreparing: 'กำลังเตรียมติดตั้งโมเดล KataGo อย่างเป็นทางการ',
    katagoInstallFailed: 'ติดตั้งโมเดล KataGo ไม่สำเร็จ',
    languageLabel: 'ภาษาอินเทอร์เฟซ',
    languageHelp: 'มีผลต่อภาษาคำอธิบายเริ่มต้นของ AI ครูและข้อความผิดพลาดด้วย',
    reviewLanguage: 'ภาษารีวิว',
    teacherLanguage: 'ภาษา AI ครู'
  },
  'vi-VN': {
    taskFailed: 'Tác vụ thất bại',
    unknownError: 'Lỗi không xác định',
    settingsSaved: 'Đã lưu cài đặt',
    benchmarkStarting: 'Đang chạy benchmark KataGo chính thức. Thường mất vài chục giây.',
    benchmarkFailed: 'Benchmark KataGo thất bại',
    katagoInstallPreparing: 'Đang chuẩn bị cài model KataGo chính thức.',
    katagoInstallFailed: 'Cài model KataGo chính thức thất bại',
    languageLabel: 'Ngôn ngữ giao diện',
    languageHelp: 'Cũng ảnh hưởng đến ngôn ngữ mặc định của AI teacher và thông báo lỗi.',
    reviewLanguage: 'Ngôn ngữ review',
    teacherLanguage: 'Ngôn ngữ AI teacher'
  }
}

export function createUiTranslator(localeInput: unknown): (key: TranslationKey) => string {
  const locale = normalizeUiLocale(localeInput)
  return (key) => DICT[locale][key] ?? DICT['zh-CN'][key]
}

type UiErrorKind = 'katago' | 'llm' | 'network' | 'sgf' | 'permission' | 'timeout' | 'unknown'

function rawError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function classifyUiError(raw: string): UiErrorKind {
  const lower = raw.toLowerCase()
  if (/katago|model|engine|gtp|weights|network\.gz|opencl|cuda/.test(lower)) return 'katago'
  if (/llm|openai|api key|base url|chat completions|unauthorized|401|403|model not found/.test(lower)) return 'llm'
  if (/timeout|timed out/.test(lower)) return 'timeout'
  if (/fetch|network|dns|proxy|econn|socket/.test(lower)) return 'network'
  if (/sgf|棋谱|record|parse/.test(lower)) return 'sgf'
  if (/permission|access denied|safeStorage|keychain|eacces|eperm/.test(lower)) return 'permission'
  return 'unknown'
}

const ERROR_COPY: Record<UiLocale, Record<UiErrorKind, { title: string; action: string }>> = {
  'zh-CN': {
    katago: { title: '围棋分析引擎还没准备好。', action: '请检查 KataGo 程序和模型路径，或让 GoMentor 自动下载资源。' },
    llm: { title: 'AI 老师暂时不能生成讲解。', action: '请检查模型名称、API Key 和 Base URL；你仍然可以先看 KataGo 分析。' },
    network: { title: '网络连接失败。', action: '请检查网络、代理或服务地址后再试。' },
    sgf: { title: '棋谱没有完整读取成功。', action: '请确认它是标准 SGF；GoMentor 会尽量使用已读取部分。' },
    permission: { title: '没有权限读取或保存这个文件。', action: '请换一个目录，或在系统设置里允许访问。' },
    timeout: { title: '分析等待太久，已经停止。', action: '可以先降低 visits，或只分析关键手。' },
    unknown: { title: '这个操作没有完成。', action: '请查看下面的技术信息。' }
  },
  'en-US': {
    katago: { title: 'The Go analysis engine is not ready.', action: 'Check the KataGo binary and model path, or let GoMentor download the assets.' },
    llm: { title: 'The AI teacher cannot generate an explanation right now.', action: 'Check the model name, API key, and base URL. KataGo analysis is still available.' },
    network: { title: 'Network connection failed.', action: 'Check your connection, proxy, or service URL, then try again.' },
    sgf: { title: 'The game record could not be fully read.', action: 'Make sure it is a standard SGF file. GoMentor will use the parsed part when possible.' },
    permission: { title: 'No permission to read or save this file.', action: 'Choose another folder or grant access in system settings.' },
    timeout: { title: 'The analysis took too long and stopped.', action: 'Try fewer visits or analyze only key moves first.' },
    unknown: { title: 'This action could not be completed.', action: 'See the technical detail below.' }
  },
  'ja-JP': {
    katago: { title: '囲碁解析エンジンの準備ができていません。', action: 'KataGo 本体とモデルのパスを確認するか、自動ダウンロードを使ってください。' },
    llm: { title: 'AI 先生の解説を生成できません。', action: 'モデル名、API Key、Base URL を確認してください。KataGo 解析は先に確認できます。' },
    network: { title: 'ネットワーク接続に失敗しました。', action: '通信環境、プロキシ、サービス URL を確認して再試行してください。' },
    sgf: { title: '棋譜を完全には読み込めませんでした。', action: '標準 SGF か確認してください。読み取れた部分は利用します。' },
    permission: { title: 'ファイルの読み書き権限がありません。', action: '別の場所を選ぶか、システム設定でアクセスを許可してください。' },
    timeout: { title: '解析に時間がかかりすぎたため停止しました。', action: 'visits を下げるか、重要な手だけ先に解析してください。' },
    unknown: { title: '操作を完了できませんでした。', action: '下の技術情報を確認してください。' }
  },
  'ko-KR': {
    katago: { title: '바둑 분석 엔진이 준비되지 않았습니다.', action: 'KataGo 실행 파일과 모델 경로를 확인하거나 자동 다운로드를 사용하세요.' },
    llm: { title: 'AI 선생님의 해설을 생성할 수 없습니다.', action: '모델 이름, API Key, Base URL을 확인하세요. KataGo 분석은 먼저 볼 수 있습니다.' },
    network: { title: '네트워크 연결에 실패했습니다.', action: '네트워크, 프록시, 서비스 주소를 확인한 뒤 다시 시도하세요.' },
    sgf: { title: '기보를 완전히 읽지 못했습니다.', action: '표준 SGF인지 확인하세요. 읽은 부분은 사용할 수 있습니다.' },
    permission: { title: '파일을 읽거나 저장할 권한이 없습니다.', action: '다른 위치를 선택하거나 시스템 설정에서 접근을 허용하세요.' },
    timeout: { title: '분석 시간이 너무 길어 중지했습니다.', action: 'visits를 낮추거나 핵심 수만 먼저 분석하세요.' },
    unknown: { title: '작업을 완료하지 못했습니다.', action: '아래 기술 정보를 확인하세요.' }
  },
  'th-TH': {
    katago: { title: 'เอนจินวิเคราะห์หมากล้อมยังไม่พร้อม', action: 'ตรวจสอบ KataGo และโมเดล หรือใช้การดาวน์โหลดอัตโนมัติ' },
    llm: { title: 'AI ครูยังสร้างคำอธิบายไม่ได้', action: 'ตรวจสอบชื่อโมเดล API Key และ Base URL; ยังดู KataGo analysis ได้ก่อน' },
    network: { title: 'เชื่อมต่อเครือข่ายไม่สำเร็จ', action: 'ตรวจสอบเน็ต proxy หรือ URL แล้วลองอีกครั้ง' },
    sgf: { title: 'อ่าน棋谱/SGF ได้ไม่ครบ', action: 'ตรวจสอบว่าเป็น SGF มาตรฐาน ระบบจะใช้ส่วนที่อ่านได้' },
    permission: { title: 'ไม่มีสิทธิ์อ่านหรือบันทึกไฟล์นี้', action: 'เลือกที่เก็บอื่นหรืออนุญาตสิทธิ์ในระบบ' },
    timeout: { title: 'วิเคราะห์นานเกินไปจึงหยุด', action: 'ลองลด visits หรือดูเฉพาะจุดสำคัญก่อน' },
    unknown: { title: 'ดำเนินการไม่สำเร็จ', action: 'ดูรายละเอียดทางเทคนิคด้านล่าง' }
  },
  'vi-VN': {
    katago: { title: 'Engine phân tích cờ vây chưa sẵn sàng.', action: 'Kiểm tra KataGo và model, hoặc dùng tải tự động.' },
    llm: { title: 'AI teacher chưa tạo được giải thích.', action: 'Kiểm tra model, API Key và Base URL; bạn vẫn xem KataGo analysis trước được.' },
    network: { title: 'Kết nối mạng thất bại.', action: 'Kiểm tra mạng, proxy hoặc URL rồi thử lại.' },
    sgf: { title: 'Không đọc đầy đủ được SGF.', action: 'Hãy kiểm tra file SGF chuẩn; hệ thống sẽ dùng phần đã đọc được.' },
    permission: { title: 'Không có quyền đọc hoặc lưu file này.', action: 'Chọn thư mục khác hoặc cấp quyền trong hệ thống.' },
    timeout: { title: 'Phân tích quá lâu nên đã dừng.', action: 'Thử giảm visits hoặc chỉ phân tích nước quan trọng trước.' },
    unknown: { title: 'Thao tác chưa hoàn tất.', action: 'Xem chi tiết kỹ thuật bên dưới.' }
  }
}

export function humanizeUiError(error: unknown, localeInput: unknown = 'zh-CN', context?: string): string {
  const locale = normalizeUiLocale(localeInput)
  const raw = rawError(error)
  const kind = classifyUiError(`${context ?? ''} ${raw}`)
  const copy = ERROR_COPY[locale][kind]
  return `${copy.title}\n${copy.action}\n\n${raw}`
}
