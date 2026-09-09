import tkinter as tk
from tkinter import ttk, filedialog, scrolledtext
import subprocess
import os
import shutil
import zipfile
import glob
import datetime
import time
import threading
import stat
import re

# =============================================================================
# LÓGICA DE SISTEMA (BACKEND)
# =============================================================================

def on_rm_error(func, path, exc_info):
    os.chmod(path, stat.S_IWRITE)
    func(path)

def run_step(logger, tag, msg):
    logger(f"\n{msg}", tag)

def clean_legacy_services(logger, port):
    run_step(logger, "step", "== [ETAPA 1/5] Limpeza de Serviços e Portas ==")
    services = ["InfoboardService", "Infoboard TV", "infoboardservice.exe"]
    for srv in services:
        try:
            res = subprocess.run(["sc.exe", "query", srv], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            if "FAILED" not in res.stdout:
                logger(f"Serviço legado '{srv}' detectado. Parando...", "warn")
                subprocess.run(["net.exe", "stop", srv], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                time.sleep(1)
                subprocess.run(["sc.exe", "delete", srv], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
                logger(f"Serviço '{srv}' deletado.", "dim")
        except Exception:
            pass

    try:
        logger(f"Garantindo que a porta {port} esteja livre...", "dim")
        ps_cmd = f"Get-NetTCPConnection -LocalPort {port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"
        res = subprocess.run(["powershell", "-Command", ps_cmd], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        for pid in res.stdout.strip().splitlines():
            if pid.strip():
                subprocess.run(["taskkill", "/F", "/PID", pid.strip()], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    except Exception:
        pass
    logger("[OK] Ambiente limpo.", "ok")

def create_backup(target_dir, logger):
    if not os.path.exists(os.path.join(target_dir, "server.js")):
        return
    run_step(logger, "step", "== [ETAPA 2/5] Criando Backup de Segurança ==")
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"backup_{timestamp}.zip"
    backup_path = os.path.join(target_dir, backup_filename)
    logger(f"Compactando arquivos em: {backup_filename}", "warn")
    
    with zipfile.ZipFile(backup_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(target_dir):
            if 'node_modules' in dirs: dirs.remove('node_modules')
            if '.git' in dirs: dirs.remove('.git')
            if '__pycache__' in dirs: dirs.remove('__pycache__')
            for file in files:
                if file.endswith('.zip'): continue
                abs_file = os.path.join(root, file)
                rel_file = os.path.relpath(abs_file, target_dir)
                zipf.write(abs_file, rel_file)
    logger("[OK] Backup criado com sucesso.", "ok")

def sync_github(target_dir, logger):
    run_step(logger, "step", "== [ETAPA 3/5] Download do GitHub ==")
    git_url = "https://github.com/JSDavi/Infoboard.git"
    git_dir = os.path.join(target_dir, ".git")
    
    if os.path.exists(git_dir):
        logger("Repositório detectado. Atualizando alterações...", "dim")
        res1 = subprocess.run(["git", "fetch", "origin", "master"], cwd=target_dir, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if res1.returncode != 0: logger(f"Aviso no Fetch: {res1.stderr}", "warn")
        
        res2 = subprocess.run(["git", "reset", "--hard", "origin/master"], cwd=target_dir, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        if res2.returncode != 0: logger(f"Aviso no Reset: {res2.stderr}", "warn")
    else:
        logger("Baixando sistema do zero (Clone)...", "dim")
        temp_clone = os.path.join(os.environ.get("TEMP", "C:\\"), "InfoCloneTemp")
        if os.path.exists(temp_clone): shutil.rmtree(temp_clone, onerror=on_rm_error)
        
        try:
            res = subprocess.run(["git", "clone", git_url, temp_clone], capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
            if res.returncode != 0:
                raise Exception(f"Falha ao clonar do GitHub:\n{res.stderr.strip()}")
        except FileNotFoundError:
            raise Exception("Git não está instalado ou não foi encontrado no sistema.")
            
        shutil.copytree(temp_clone, target_dir, dirs_exist_ok=True)
        shutil.rmtree(temp_clone, onerror=on_rm_error)
    logger("[OK] Código atualizado.", "ok")

def setup_env_and_npm(target_dir, port, env_content, logger):
    run_step(logger, "step", "== [ETAPA 4/5] Variáveis e NPM ==")
    env_file = os.path.join(target_dir, ".env")
    
    new_keys = env_content if isinstance(env_content, dict) else {}
    final_content = []
    
    if os.path.exists(env_file):
        with open(env_file, "r", encoding="utf-8") as f: 
            final_content = f.readlines()
    
    updated_keys = set()
    output_lines = []
    found_port = False
    
    for line in final_content:
        clean = line.strip()
        if not clean or clean.startswith("#"):
            output_lines.append(line)
            continue
            
        if "=" in clean:
            key = clean.split("=", 1)[0].strip()
            if key == "PORT":
                output_lines.append(f"PORT={port}\n")
                found_port = True
            elif key in new_keys:
                output_lines.append(f"{key}={new_keys[key]}\n")
                updated_keys.add(key)
            else:
                output_lines.append(line)
        else:
            output_lines.append(line)
            
    if not found_port:
        output_lines.append(f"PORT={port}\n")
        
    for k, v in new_keys.items():
        if k not in updated_keys and v.strip():
            output_lines.append(f"{k}={v}\n")
            
    with open(env_file, "w", encoding="utf-8") as f:
        f.writelines(output_lines)
            
    logger(f"[OK] Arquivo .env configurado na porta {port}.", "ok")
    
    logger("Instalando dependências (npm install)... Isso pode demorar.", "warn")
    npm_cmd = shutil.which("npm") or "npm.cmd"
    subprocess.run([npm_cmd, "install", "--omit=dev"], cwd=target_dir, shell=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    logger("[OK] Dependências instaladas.", "ok")

def setup_firewall_and_service(target_dir, port, logger):
    run_step(logger, "step", "== [ETAPA 5/5] Windows Service ==")
    subprocess.run(["netsh", "advfirewall", "firewall", "delete", "rule", "name=Infoboard TV"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    subprocess.run(["netsh", "advfirewall", "firewall", "add", "rule", "name=Infoboard TV", "dir=in", "action=allow", "protocol=TCP", f"localport={port}"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    logger(f"Regra de Firewall criada na porta {port}.", "dim")
    
    install_script = os.path.join(target_dir, "instalador", "install_service.js")
    if not os.path.exists(install_script): install_script = os.path.join(target_dir, "install_service.js")
    
    if os.path.exists(install_script):
        # PATCH PARA CORRIGIR PORTA FIXA "3000" NO CÓDIGO DO NODE-WINDOWS
        with open(install_script, "r", encoding="utf-8") as f:
            script_data = f.read()
        script_data = re.sub(r'value:\s*["\']3000["\']', f'value: "{port}"', script_data)
        with open(install_script, "w", encoding="utf-8") as f:
            f.write(script_data)
            
        logger("Registrando serviço nativo...", "dim")
        node_cmd = shutil.which("node") or "node"
        env = os.environ.copy()
        env["PORT"] = str(port)
        subprocess.run([node_cmd, install_script], cwd=target_dir, env=env, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    
    time.sleep(2)
    subprocess.run(["net", "start", "infoboardservice.exe"], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    logger(f"[SUCESSO] Instalação concluída! O painel está rodando na porta {port}.", "highlight")

def execute_install_flow(target_dir, port, env_content, logger, progress, on_finish):
    try:
        progress(0)
        if not os.path.exists(target_dir): os.makedirs(target_dir)
        
        clean_legacy_services(logger, port)
        progress(20)
        
        create_backup(target_dir, logger)
        progress(40)
        
        sync_github(target_dir, logger)
        progress(60)
        
        setup_env_and_npm(target_dir, port, env_content, logger)
        progress(80)
        
        setup_firewall_and_service(target_dir, port, logger)
        progress(100)
    except Exception as e:
        logger(f"[ERRO CRÍTICO] {str(e)}", "err")
    finally:
        on_finish()

def execute_restore_flow(target_dir, backup_file, port, logger, progress, on_finish):
    try:
        progress(0)
        run_step(logger, "step", "== INICIANDO RESTAURAÇÃO DE BACKUP ==")
        
        clean_legacy_services(logger, port)
        progress(33)
        
        logger("Limpando arquivos problemáticos da versão atual...", "warn")
        for item in os.listdir(target_dir):
            if not item.endswith(".zip"):
                path = os.path.join(target_dir, item)
                if os.path.isdir(path): shutil.rmtree(path, onerror=on_rm_error)
                else: os.remove(path)
                
        logger(f"Descompactando backup: {os.path.basename(backup_file)}", "dim")
        with zipfile.ZipFile(backup_file, 'r') as zip_ref:
            zip_ref.extractall(target_dir)
        progress(66)
            
        setup_firewall_and_service(target_dir, port, logger)
        progress(100)
    except Exception as e:
        logger(f"[ERRO CRÍTICO] {str(e)}", "err")
    finally:
        on_finish()


# =============================================================================
# INTERFACE GRÁFICA (FRONTEND)
# =============================================================================

class SetupGUI(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Instalador Infoboard TV")
        self.geometry("600x720")
        self.configure(bg="#f4f6f9")
        self.resizable(False, False)
        
        self.dest_folder_var = tk.StringVar(value=r"C:\Painel_Infoboard")
        self.port_var = tk.StringVar(value="3000")
        self.env_content = {}
        self.latest_backup_file = None
        self.is_processing = False
        
        self._build_ui()
        self.dest_folder_var.trace_add("write", lambda *args: self.check_backup_status())
        self.check_backup_status()
        self.log("== INSTALADOR INFOBOARD TV ==", "step")
        self.log("Pronto para instalar ou restaurar.", "dim")

    def _build_ui(self):
        tk.Label(self, text="Infoboard TV Setup", font=("Segoe UI", 16, "bold"), bg="#f4f6f9").pack(pady=10)
        
        cfg_frame = ttk.LabelFrame(self, text=" Configurações de Instalação ", padding=10)
        cfg_frame.pack(fill="x", padx=20, pady=5)
        
        tk.Label(cfg_frame, text="Pasta:").grid(row=0, column=0, sticky="w")
        ttk.Entry(cfg_frame, textvariable=self.dest_folder_var, width=50).grid(row=0, column=1, padx=5)
        tk.Button(cfg_frame, text="Procurar...", command=self.on_browse).grid(row=0, column=2)
        
        tk.Label(cfg_frame, text="Porta:").grid(row=1, column=0, sticky="w", pady=10)
        ttk.Spinbox(cfg_frame, textvariable=self.port_var, from_=1, to=65535, width=10).grid(row=1, column=1, sticky="w", padx=5, pady=10)
        
        btn_env = tk.Button(cfg_frame, text="⚙️ Preencher Dados do Servidor (.env)", bg="#34495e", fg="white", font=("Segoe UI", 9, "bold"), command=self.on_env_config)
        btn_env.grid(row=2, column=0, columnspan=3, pady=(5,0), sticky="ew")
        
        act_frame = tk.Frame(self, bg="#f4f6f9")
        act_frame.pack(fill="x", padx=20, pady=10)
        
        self.btn_install = tk.Button(act_frame, text="🚀 Instalar / Atualizar Painel", font=("Segoe UI", 12, "bold"), bg="#27ae60", fg="white", command=self.on_install)
        self.btn_install.pack(fill="x", pady=5)
        
        self.btn_restore = tk.Button(act_frame, text="🔄 Restaurar Backup", font=("Segoe UI", 10, "bold"), bg="#2980b9", fg="white", command=self.on_restore)
        self.btn_restore.pack(fill="x", pady=5)
        
        self.progress_var = tk.DoubleVar(value=0)
        self.progress_bar = ttk.Progressbar(self, variable=self.progress_var, maximum=100, mode='determinate')
        self.progress_bar.pack(fill="x", padx=20, pady=(10, 0))

        self.console = scrolledtext.ScrolledText(self, bg="#121212", fg="#ecf0f1", font=("Consolas", 9), height=14)
        self.console.pack(fill="both", expand=True, padx=20, pady=(5, 15))
        self.console.tag_config("step", foreground="#3498db", font=("Consolas", 9, "bold"))
        self.console.tag_config("ok", foreground="#2ecc71", font=("Consolas", 9, "bold"))
        self.console.tag_config("warn", foreground="#f1c40f")
        self.console.tag_config("err", foreground="#e74c3c", font=("Consolas", 9, "bold"))
        self.console.tag_config("dim", foreground="#95a5a6")
        self.console.tag_config("highlight", foreground="#00ff00", font=("Consolas", 10, "bold"))

    def log(self, msg, tag="text"):
        self.console.insert("end", msg + "\n", tag)
        self.console.see("end")
        
    def on_env_config(self):
        top = tk.Toplevel(self)
        top.title("Configurar Variáveis (.env)")
        top.geometry("500x560")
        top.transient(self)
        top.grab_set()
        
        tk.Label(top, text="Preencha as credenciais do sistema:", font=("Segoe UI", 12, "bold")).pack(pady=10)
        
        frame = ttk.Frame(top, padding=10)
        frame.pack(fill="both", expand=True)
        
        fields = [
            ("NPX_EMAIL", "Email NPX:"),
            ("NPX_PASSWORD", "Senha NPX:"),
            ("PRIXCHAT_EMAIL", "Email PrixChat:"),
            ("PRIXCHAT_PASSWORD", "Senha PrixChat:"),
            ("PRIXCHAT_BACKEND", "Backend PrixChat:"),
            ("PBX_BASE_URL", "URL do PBX:"),
            ("PBX_API_TOKEN", "PBX Token:"),
            ("PBX_API_KEY", "PBX Key:"),
            ("ENABLE_TELEGRAM_ALERTS", "Alertas Telegram (true/false):"),
            ("TELEGRAM_BOT_TOKEN", "Telegram Bot Token:"),
            ("TELEGRAM_CHAT_ID", "Telegram Chat ID:"),
            ("TELEGRAM_SLA_LIMIT_SEC", "Telegram SLA Limite (seg):")
        ]
        
        entries = {}
        for i, (key, label) in enumerate(fields):
            tk.Label(frame, text=label).grid(row=i, column=0, sticky="e", pady=5, padx=5)
            ent = ttk.Entry(frame, width=35)
            ent.grid(row=i, column=1, pady=5, padx=5)
            if key in self.env_content:
                ent.insert(0, self.env_content[key])
            entries[key] = ent
            
        def save_env():
            self.env_content = {k: v.get() for k, v in entries.items()}
            self.log("As credenciais foram salvas no Instalador.", "ok")
            top.destroy()
            
        tk.Button(top, text="💾 Salvar Configurações", font=("Segoe UI", 10, "bold"), bg="#27ae60", fg="white", command=save_env).pack(pady=15)

    def update_progress(self, value):
        self.progress_var.set(value)
        self.update_idletasks()

    def check_backup_status(self):
        folder = self.dest_folder_var.get().strip()
        if os.path.exists(folder):
            backups = glob.glob(os.path.join(folder, "backup_*.zip"))
            if backups:
                self.latest_backup_file = max(backups, key=os.path.getmtime)
                date_str = datetime.datetime.fromtimestamp(os.path.getmtime(self.latest_backup_file)).strftime("%d/%m %H:%M")
                self.btn_restore.config(state="normal", text=f"🔄 Restaurar Backup Anterior (Data: {date_str})", bg="#2980b9")
                return
        self.latest_backup_file = None
        self.btn_restore.config(state="disabled", text="🔄 Restaurar Backup (Nenhum backup encontrado)", bg="#7f8c8d")

    def on_browse(self):
        folder = filedialog.askdirectory(initialdir=self.dest_folder_var.get())
        if folder: self.dest_folder_var.set(os.path.normpath(folder))

    def disable_ui(self):
        self.is_processing = True
        self.btn_install.config(state="disabled")
        self.btn_restore.config(state="disabled")

    def enable_ui(self):
        self.is_processing = False
        self.btn_install.config(state="normal")
        self.check_backup_status()

    def on_install(self):
        if self.is_processing: return
        self.disable_ui()
        self.console.delete(1.0, "end")
        target_dir = self.dest_folder_var.get().strip()
        port = self.port_var.get().strip()
        threading.Thread(target=execute_install_flow, args=(target_dir, port, self.env_content, self.log, self.update_progress, self.enable_ui), daemon=True).start()

    def on_restore(self):
        if self.is_processing or not self.latest_backup_file: return
        self.disable_ui()
        self.console.delete(1.0, "end")
        target_dir = self.dest_folder_var.get().strip()
        port = self.port_var.get().strip()
        threading.Thread(target=execute_restore_flow, args=(target_dir, self.latest_backup_file, port, self.log, self.update_progress, self.enable_ui), daemon=True).start()

if __name__ == "__main__":
    SetupGUI().mainloop()
