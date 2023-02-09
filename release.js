const {execSync} = require('child_process');
const package = require('./package.json');
const fs = require('fs');

const config = {
  header: 'Release Notes',
  infile: 'CHANGELOG.md',
  repo: 'https://github.com',
  types: [
    {
      name: 'feat',
      section: 'Features'
    },
    {
      name: 'fix',
      section: 'Bug Fixes'
    }]
};

const generateChangelog = () => {
  const {infile, types} = config;
  const regex = new RegExp(`^(${types.map(({name}) => name).join('|')}){1}\\(([\\w\\-\\.]+)\\)(!)?: (.*?)(?: - )?(#\\S+)?\\|(.*)`, 'gi');
  const git = execSync('git log v0.1.0..HEAD --pretty=format:"%s|%h" -i -E --grep="^(feat|fix){1}"', {encoding: 'utf8'}).toString();
  const commits = git
    .split('\n')
    .map((commit) => {
      const commitDetails = commit
        .trim()
        .split(regex);

      return {
        breaking: commitDetails[3],
        hash: commitDetails[6],
        message: commitDetails[4],
        scope: commitDetails[2],
        story: commitDetails[5],
        type: commitDetails[1]
      };
    })
    .sort((a, b) => {
      const {types} = config;
      const indexA = types.findIndex(({name}) => name === a.type);
      const indexB = types.findIndex(({name}) => name === b.type);

      if(indexA < indexB) {
        return -1;
      } else if(indexA > indexB) {
        return 1;
      }

      return 0;
    });


  const {workspaces} = package;

  const appListByName = workspaces
    .reduce((apps, workspace) => {
      getApps(workspace).forEach((app) => {
        const commitList = commits.filter(({scope}) => scope === app.name);
        apps[app.name] = {...app, commits: commitList};
      });

      return apps;
    }, {});

  const updatedApps = Object.keys(appListByName)
    .filter((appName) => {
      const {commits} = appListByName[appName];
      return commits.length;
    })
    .map((appName) => appListByName[appName]);

  console.log({commits, workspaces, appListByName, updatedApps});

  const appContent = updatedApps.map((app) => {
    const sectionContent = generateSection(app);
    writeAppChangelog(app.path, sectionContent, infile);
    return sectionContent;
  });

  writeRootChangelog(appContent, infile);
};
const getApps = (source) => {
  const dirPath = source.replace('*', '');

  return fs.readdirSync(dirPath).map((appName) => {
    const appPath = `./${dirPath}${appName}`;
    const {name, version} = require(`${appPath}/package.json`);

    return {
      name,
      path: appPath,
      version
    };
  });
};

const generateHeader = () => {
  const {header} = config;
  return `# ${header}\n\n`;
};

const generateSectionHeader = (section) => `\n### ${section}\n\n`;

const generateSection = ({commits, name, version}) => {
  const {types} = config;
  let prevLine = '';

  const list = commits.reduce((sectionContent, commit) => {
    const line = generateCommitLine(commit);

    if(name !== line.scope) {
      return sectionContent;
    }

    if(line.type !== prevLine) {
      prevLine = line.type;
      const typeDetails = types.find(({name}) => name === line.type);
      sectionContent += generateSectionHeader(typeDetails.section);
    }

    sectionContent += `${line.content}\n`;

    return sectionContent;
  }, '');
  return `## ${name} v${version}\n${list}`;
};

const generateCommitLine = ({breaking, hash, message, repo, scope, story, type}) => {
  const storyLink = story ? ` [${story}](${repo}/issues/${story}): ` : '';
  const hashLink = hash ? ` ([${hash}](${repo}/commit/${hash}))` : '';
  const breaks = breaking ? ' **BREAKING CHANGE** ' : '';
  return {content: `- ${storyLink}${breaks}${message}${hashLink}`, scope, type};
};

const writeRootChangelog = (content, infile = 'CHANGELOG.md') => {
  fs.writeFileSync(`./${infile}`, `${generateHeader()}${content}`);
};

const writeAppChangelog = (path, content, infile = 'CHANGELOG.md') => {
  fs.writeFileSync(`${path}/${infile}`, `${generateHeader()}${content}`);
};

generateChangelog();