from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="portal",
    version="0.0.1",
    description="Portal Público de Catequese - PNSA",
    author="PNSA",
    author_email="admin@pnsa.mz",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)
