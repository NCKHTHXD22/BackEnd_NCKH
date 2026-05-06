import os
from huggingface_hub import HfApi
from dotenv import load_dotenv

load_dotenv()

def deploy():
    api = HfApi()
    token = os.getenv("HF_TOKEN")
    if not token:
        raise ValueError("HF_TOKEN not set. Add it to your .env file: HF_TOKEN=hf_...")
    repo_id = 'Anvo2004/lstm-inflow-api'
    
    # 2. Upload Root Files
    files_to_push = [
        'Dockerfile',
        'main_api.py',
        'requirements.txt',
        'README.md',
        '.gitignore',
        '.env'
    ]
    
    print(f"Starting deployment to {repo_id}...")
    
    for file in files_to_push:
        if os.path.exists(file):
            print(f"Uploading {file}...")
            api.upload_file(
                path_or_fileobj=file,
                path_in_repo=file,
                repo_id=repo_id,
                repo_type="space",
                token=token
            )

    # 3. Upload Essential Code Directories
    code_dirs = ['config', 'data', 'features', 'models', 'utils', 'operation', 'inference']
    for folder in code_dirs:
        if os.path.exists(folder):
            print(f"Uploading folder: {folder}...")
            api.upload_folder(
                folder_path=folder,
                path_in_repo=folder,
                repo_id=repo_id,
                repo_type="space",
                token=token
            )

    # Upload artifacts folder
    artifacts_dir = 'artifacts'
    if os.path.exists(artifacts_dir):
        print(f"Uploading {artifacts_dir} folder content...")
        for root, dirs, files in os.walk(artifacts_dir):
            for file in files:
                if file.endswith('.pt') or file.endswith('.pkl'):
                    file_path = os.path.join(root, file)
                    path_in_repo = file_path.replace(os.sep, '/')
                    print(f"Uploading {path_in_repo}...")
                    api.upload_file(
                        path_or_fileobj=file_path,
                        path_in_repo=path_in_repo,
                        repo_id=repo_id,
                        repo_type="space",
                        token=token
                    )
    
    print("✅ DEPLOYMENT FINISHED!")

if __name__ == "__main__":
    deploy()
