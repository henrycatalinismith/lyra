# Lyra web app

## Running in development

In the root folder create file `./config/projects.yaml` with example content:

```yaml
projects:
  - name: example-unique-name
    repo_path: /Users/username/fooRepo # absolute path to repo
    base_branch: main
    project_path: . # relative path of project from repo_path
    owner: amerharb
    repo: zetkin.app.zetkin.org
    github_token: << github token >>
```

Multiple projects are supported, and multiple projects in the same local git repository
are supported, but configuring multiple porjects with different `repo_path`, resolving to
same local git repository, is _not_ supported.

The project repository (client repository) needs to be cloned locally. and has in the root folder config
file `lyra.yml` with the
example content:

```yaml
projects:
  - path: . # relative path to project in repo
    messages:
      format: ts
      path: src # relative path of messages folder relative from above project path
    translations:
      path: src/locale # relative path of translations folder relative from above project path
    languages: # list of language codes supported in the project
      - sv
      - de
```
