# Feature Flags Dashboard (Console Unificado)

Este é um painel administrativo genérico, moderno e reutilizável para gerenciamento centralizado de **Feature Flags** (Toggles de Funcionalidade) em múltiplos ambientes (**DEV**, **PROD** e outros) exibidos lado a lado na mesma tela.

A aplicação conta com autenticação segura via **Google Sign-In**, restringindo o acesso exclusivamente a uma lista de e-mails pré-aprovados cadastrados localmente no `.env` e protegidos no banco de dados por regras de segurança.

---

## 🌍 O Conceito: Console Unificado (Sem Divergências)

Para evitar o desalinhamento de ambientes (por exemplo, uma flag existir em Desenvolvimento mas ser esquecida em Produção), este dashboard adota a estratégia de **Tabela Unificada**:
- 🔑 **Sincronia Total de Chaves**: Ao criar ou deletar uma feature flag no painel, a chave é automaticamente cadastrada ou removida de **todos** os ambientes conectados.
- 🎛️ **Valores Independentes**: O status (`true` ou `false`) de cada chave é controlado de forma independente por colunas específicas para cada ambiente.
- ⚠️ **Detecção de Desalinhamento (Drift)**: Caso uma chave tenha sido deletada manualmente ou criada fora do painel em algum ambiente, o sistema exibe um aviso visual de **"Desalinhada"** e disponibiliza um botão **"Alinhar"** para restaurar a sincronia instantaneamente.

---

## 📦 Instalação e Execução Local

### 1. Instalar Dependências
Entre na pasta do projeto e instale as dependências:
```bash
npm install
```

### 2. Configurar Variáveis de Ambiente
Crie um arquivo `.env` na raiz do projeto (use o `.env.example` como base) e defina as variáveis.


### 3. Rodar em Modo de Desenvolvimento
```bash
npm run dev
```
Acesse a porta informada pelo Vite no terminal (configurada por padrão para `http://localhost:3050` para evitar conflito com outros apps locais).

---

## ☁️ Deploy no Firebase

Você pode implantar o painel administrativo e suas regras de segurança de forma automatizada (via Cloud Build) ou manual.

### 1. Deploy Manual das Regras de Segurança do Firestore (Security Rules)
Para evitar o vazamento do e-mail do administrador no Git, a regra de segurança real é gerada dinamicamente com base nas variáveis do seu arquivo `.env` local.
Para compilar e implantar as regras, use o seguinte comando:
```bash
npm run deploy:rules
```
*Este comando lê a variável `VITE_ALLOWED_EMAILS` do seu `.env`, substitui o placeholder no arquivo [firestore.rules.template](file:///home/vresende/Documents/arq/feature_flag/firestore.rules.template), gera o arquivo local `firestore.rules` (que está no `.gitignore`) e faz o deploy seguro para o Firebase.*

### 2. Deploy Manual do Painel Administrativo (Hosting)
Para compilar e enviar a interface web para o Firebase Hosting:
```bash
# Gerar o build otimizado de produção
npm run build

# Enviar para o hosting configurado (use a flag --project para especificar o projeto de destino)
firebase deploy --only hosting --project SEU_PROJECT_ID
```

---

## 🔒 Regras de Segurança do Firestore (`firestore.rules.template`)

As regras de segurança utilizam o arquivo de modelo para compilar a lista de e-mails autorizados que podem escrever e gerenciar as feature flags:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /feature_flags_dev/{document} {
      allow read: if true; // Permite leitura pública por qualquer microserviço
      allow write: if request.auth != null && 
                      (request.auth.token.email in ALLOWED_EMAILS_PLACEHOLDER); // Apenas e-mails autorizados gravam
    }

    match /feature_flags_prod/{document} {
      allow read: if true;
      allow write: if request.auth != null && 
                      (request.auth.token.email in ALLOWED_EMAILS_PLACEHOLDER);
    }
  }
}
```

---

## 💻 Como implementar e consumir nos seus projetos

Aqui estão os padrões de implementação recomendados para consumir estas flags nos seus projetos de forma segura, performática e com custo zero.

### 1. No Frontend (Qualquer Stack Vite / React / TypeScript / JS)
No seu app cliente, você pode ler a flag diretamente do Firestore. Para máxima performance, use cache ou o listener em tempo real.

```typescript
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot } from "firebase/firestore";

const firebaseConfig = { /* suas credenciais */ };
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Seleciona a coleção baseada no ambiente
const collectionName = import.meta.env.DEV ? "feature_flags_dev" : "feature_flags_prod";

// Cache local em memória
let featureFlagsCache: Record<string, boolean> = {};

// Inicia escuta em tempo real
export const startFeatureFlagsWatcher = () => {
  const docIds = ["HABILITAR_COMPRA_PIX", "NOVA_TELA_LOGIN"]; // chaves a monitorar
  
  docIds.forEach((flagId) => {
    onSnapshot(doc(db, collectionName, flagId), (snapshot) => {
      if (snapshot.exists()) {
        featureFlagsCache[flagId] = snapshot.data().enabled === true;
      }
    });
  });
};

export const isFeatureEnabled = (flagName: string): boolean => {
  return featureFlagsCache[flagName] === true;
};
```

---

### 2. No Backend (Python / FastAPI / Flask / Django)
No backend, ler do Firestore a cada requisição HTTP adicionaria latência de rede desnecessária. A melhor estratégia é rodar um **Background Watcher** (usando `on_snapshot` do SDK de Python) que mantém um cache local em memória e o atualiza instantaneamente quando houver alterações.

#### Instalação do SDK:
```bash
pip install google-cloud-firestore
```

#### Código do Wrapper (`feature_flags.py`):
```python
import threading
from google.cloud import firestore

FLAGS_CACHE = {}
_lock = threading.Lock()

# Define a coleção baseada na variável de ambiente do backend
import os
env = os.getenv("ENVIRONMENT", "dev").lower()
COLLECTION_NAME = "feature_flags_dev" if env == "dev" else "feature_flags_prod"

def start_flags_watcher():
    db = firestore.Client()
    col_ref = db.collection(COLLECTION_NAME)

    def on_snapshot(col_snapshot, changes, read_time):
        global FLAGS_CACHE
        with _lock:
            for doc in col_snapshot:
                FLAGS_CACHE[doc.id] = doc.to_dict()
            print("[Feature Flags] Cache local atualizado:", FLAGS_CACHE)

    # Inicia escuta em tempo real em uma thread de background
    col_ref.on_snapshot(on_snapshot)

def is_feature_enabled(flag_name: str, default: bool = False) -> bool:
    with _lock:
        flag_data = FLAGS_CACHE.get(flag_name)
    if flag_data:
        return flag_data.get("enabled", default)
    return default
```

Inicie o watcher no arquivo de inicialização do seu backend:
```python
from feature_flags import start_flags_watcher, is_feature_enabled

@app.on_event("startup")
async def startup_event():
    start_flags_watcher()

@app.get("/items")
async def get_items():
    if is_feature_enabled("NOVA_API_ITEMS"):
        return process_new_flow()
    return process_legacy_flow()
```

---

### 3. Em Cloud Functions / Serverless (Python)
Como Cloud Functions são serverless e iniciadas sob demanda (têm ciclo de vida efêmero), usar watchers constantes não é o ideal. Nelas, efetue uma leitura direta rápida ou use variáveis de cache globais de instância para economizar leituras em execuções quentes.

```python
from google.cloud import firestore
import os

db = firestore.Client()
env = os.getenv("ENVIRONMENT", "dev").lower()
COLLECTION_NAME = "feature_flags_dev" if env == "dev" else "feature_flags_prod"

FLAG_CACHE = {}

def get_flag_status(flag_name: str) -> bool:
    global FLAG_CACHE
    
    if flag_name in FLAG_CACHE:
        return FLAG_CACHE[flag_name]
        
    try:
        doc_ref = db.collection(COLLECTION_NAME).document(flag_name)
        doc = doc_ref.get()
        if doc.exists:
            status = doc.to_dict().get("enabled", False)
            FLAG_CACHE[flag_name] = status
            return status
    except Exception as e:
        print(f"Erro ao buscar feature flag {flag_name}: {e}")
        
    return False # Fallback seguro
```
