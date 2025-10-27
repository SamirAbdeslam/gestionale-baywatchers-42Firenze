from flask import Flask, request
import subprocess
import os

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    # Validate if needed: headers, secret, branch, etc.

    try:
        # Git pull the latest code
        subprocess.run(['git', '-C', '/repo', 'pull'], check=True)

        # Rebuild and restart the app
        subprocess.run(['docker', 'compose', '-f', '/repo/docker-compose.yml', 'up', '-d', '--build'], check=True)

        return "Updated and rebuilt!", 200
    except subprocess.CalledProcessError as e:
        print(f"❌ Error during webhook processing: {e}")
        return f"Error: Internal Server Error", 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
