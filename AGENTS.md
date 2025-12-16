minecraft mineflayer bot, it must be modular type of bot so the methods and files should always be reusable

- always use @config folder for config files


# **System Instructions: Git Development Workflow >> MUST FOLLOW EVERY CONVERSATION MADE**


## 2. Core Principles

- **Isolation**: Each distinct task must be performed on its own dedicated branch. Never commit unrelated changes to the same branch.
- **Traceability**: Branch names and commit messages must be structured and descriptive, allowing for a clear and understandable project history.
- **Integration via Review**: The `main` branch is protected. All changes must be merged into `main` through a Pull Request, ensuring a point of review and quality control.
- **Synchronization**: Your local `main` branch must always be synchronized with the remote `origin/main` before starting any new work.

## 3. Branch Naming Convention

All branches must adhere to the following structure:

**Format:** `<type>/<scope>/<short_description>`

---

### **Component Definitions:**

#### **`<type>`** (Mandatory)

This defines the purpose of the branch. It must be one of the following keywords:

- **`feature`**: For adding a new feature or functionality (e.g., creating a new app, adding a new model or view).
- **`setup`**: For initial project or feature setup and configuration (e.g., creating the Django project, adding `.gitignore`, configuring settings).
- **`fix`**: For bug fixes that correct unintended behavior.
- **`docs`**: For changes to documentation only (e.g., updating `README.md`, adding code comments).
- **`style`**: For code style changes that do not affect logic (e.g., formatting, linting).
- **`refactor`**: For code changes that neither fix a bug nor add a feature, but improve its structure or performance.
- **`test`**: For adding or modifying tests.

#### **`<scope>`** (Mandatory)

This defines the module, component, or app affected by the changes.

- Use the exact app name (e.g., `ShelfSmart`, `user_auth`).
- Use `project` for project-wide changes (e.g., configuring `settings.py`, root `urls.py`).
- Use `git` for repository-level changes (e.g., `.gitignore`).

#### **`<short_description>`** (Mandatory)

A brief, hyphenated (`kebab-case`) description of the task.

- Use verbs (e.g., `create-app`, `add-user-model`, `configure-static-files`).
- Keep it concise but clear.

---

### **Task Type Prefix**
- Technical tech
- Feature feature
- Bug Fix fix
- Setup setup

### **Examples of Valid Branch Names:**

- `setup/project/create-django-project`
- `feature/ShelfSmart/create-app`
- `feature/ShelfSmart/add-book-model`
- `fix/user_auth/resolve-login-bug`
- `tech/login/change_library`

## 4. Commit Message Convention

All commit messages must follow the Conventional Commits specification.

**Format:** `<type>(<scope>): <description>`

---

### **Component Definitions:**

#### **`<type>`** (Mandatory)

Use the **same keywords** as defined in the branch naming convention (`feature`, `setup`, `fix`, etc.). The commit `type` must align with the branch `type`.

#### **`<scope>`** (Mandatory)

Use the **same scope** as defined in the branch naming convention (`ShelfSmart`, `project`, etc.). The commit `scope` must align with the branch `scope`.

#### **`<description>`** (Mandatory)

- A concise summary of the change in the **imperative mood** (e.g., "add," "fix," "update," not "added," "fixed," "updated").
- Starts with a lowercase letter.
- Does not end with a period.

---

### **Examples of Valid Commit Messages:**

- `setup(git): add gitignore file`
- `setup(project): create the django project`
- `feature(ShelfSmart): create app`
- `feature(ShelfSmart): setup settings for the app`
- `fix(ShelfSmart): prevent duplicate book entries`




