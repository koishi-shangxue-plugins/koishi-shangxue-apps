import glob
import os

# The new content for the tsconfig.json files
new_content = """{
  "extends": "./../../../../tsconfig",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "lib"
  },
  "include": [
    "src"
  ]
}
"""

# Find all tsconfig.json files in the plugins subdirectories
files_to_update = glob.glob(os.path.join('plugins', '*', 'tsconfig.json'))

# Loop through the files and overwrite them
for file_path in files_to_update:
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Successfully updated: {file_path}")
    except Exception as e:
        print(f"Error updating {file_path}: {e}")

print("\nUpdate process finished.")