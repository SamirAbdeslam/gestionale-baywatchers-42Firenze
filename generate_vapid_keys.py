#!/usr/bin/env python3
"""
VAPID Key Generator for Web Push Notifications

This script generates the VAPID (Voluntary Application Server Identification) keys
required for sending web push notifications.

Usage:
    python generate_vapid_keys.py

The generated keys should be added to your .env file:
    VAPID_PUBLIC_KEY=<public_key>
    VAPID_PRIVATE_KEY=<private_key>
    VAPID_EMAIL=mailto:your-email@example.com
"""

try:
    from py_vapid import Vapid
except ImportError:
    print("❌ Error: py-vapid not installed")
    print("Please install it with: pip install py-vapid")
    exit(1)

def generate_vapid_keys():
    """Generate and display VAPID keys."""
    print("\n" + "="*60)
    print("🔑 VAPID Key Generator for Web Push Notifications")
    print("="*60 + "\n")
    
    print("Generating VAPID keys...")
    
    # Generate new VAPID keys
    vapid = Vapid()
    vapid.generate_keys()
    
    # Get keys in the format we need
    private_key = vapid.private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    ).decode('utf-8')
    
    public_key = vapid.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint
    )
    
    import base64
    public_key_base64 = base64.urlsafe_b64encode(public_key).decode('utf-8').rstrip('=')
    
    print("\n✅ Keys generated successfully!")
    print("\n" + "-"*60)
    print("Add these lines to your .env file:")
    print("-"*60 + "\n")
    
    print(f"VAPID_PUBLIC_KEY={public_key_base64}")
    print(f"VAPID_PRIVATE_KEY={private_key.strip()}")
    print("VAPID_EMAIL=mailto:your-email@example.com")
    
    print("\n" + "-"*60)
    print("⚠️  IMPORTANT:")
    print("-"*60)
    print("• Keep the PRIVATE key secret!")
    print("• Never commit it to version control")
    print("• Update VAPID_EMAIL with your actual contact email")
    print("  (Use your own or a team email like: mailto:baywatchers@42firenze.it)")
    print("• The PUBLIC key will be shared with browsers")
    print("\n" + "="*60 + "\n")

if __name__ == "__main__":
    from cryptography.hazmat.primitives import serialization
    generate_vapid_keys()
