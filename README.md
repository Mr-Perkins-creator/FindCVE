#FindCVE
FindCVE/
│── docker-compose.yml
│── README.md
│── logs/                # все логи сервисов
│── migrations/
│   └── init.sql         # схема базы
│── services/
│   ├── cve-api/         # FastAPI сервер
│   │   └── main.py
│   ├── cve-worker/      # фоновый загрузчик CVE
│   │   └── app.py
│   ├── web-ui/          # React фронтенд
│   └── cve-bot/         # Telegram бот
└── .env
## Описание
FindCVE — это система для поиска и мониторинга CVE, с интеграцией GitHub PoC и телеграм-ботом.  
Полный стек:
- **PostgreSQL** (хранение CVE)
- **FastAPI** (API для фронтенда)
- **React + Tailwind** (Web UI)
- **Worker** (фоновая загрузка CVE из NVD)
- **Telegram Bot**

---

## 🚀 Запуск
```bash
git clone https://github.com/Mr-Perkins-creator/FindCVE.git
cd FindCVE
cp .env.example .env
docker compose up --build

После сборки и запуска:
API доступно на http://localhost:8080
Веб-интерфейс — http://localhost:3000
База данных Postgres — порт 5432
Логи сохраняются в logs/
